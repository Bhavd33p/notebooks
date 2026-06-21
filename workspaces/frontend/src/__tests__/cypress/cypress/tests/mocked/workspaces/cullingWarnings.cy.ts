import { mockModArchResponse } from 'mod-arch-core';
import { workspaces } from '~/__tests__/cypress/cypress/pages/workspaces/workspaces';
import {
  buildMockNamespace,
  buildMockWorkspace,
  buildMockWorkspaceKindInfo,
} from '~/shared/mock/mockBuilder';
import { NOTEBOOKS_API_VERSION } from '~/__tests__/cypress/cypress/support/commands/api';
import { navBar } from '~/__tests__/cypress/cypress/pages/components/navBar';
import { V1Beta1WorkspaceState } from '~/generated/data-contracts';

const DEFAULT_NAMESPACE = 'default';
const MAX_INACTIVE_SECONDS = 30 * 60; // 30 minutes

// builds a running workspace whose last activity was `minutesAgo` minutes ago,
// with culling enabled.
const cullingWorkspace = (name: string, minutesAgo: number) =>
  buildMockWorkspace({
    name,
    state: V1Beta1WorkspaceState.WorkspaceStateRunning,
    activity: {
      lastActivity: Date.now() - minutesAgo * 60 * 1000,
      lastUpdate: Date.now(),
    },
    workspaceKind: buildMockWorkspaceKindInfo({
      name: 'jupyterlab',
      cullingConfig: { maxInactiveSeconds: MAX_INACTIVE_SECONDS },
    }),
  });

const setup = (mockWorkspaces: ReturnType<typeof buildMockWorkspace>[]) => {
  const mockNamespace = buildMockNamespace({ name: DEFAULT_NAMESPACE });

  cy.interceptApi(
    'GET /api/:apiVersion/namespaces',
    { path: { apiVersion: NOTEBOOKS_API_VERSION } },
    mockModArchResponse([mockNamespace]),
  ).as('getNamespaces');

  cy.interceptApi(
    'GET /api/:apiVersion/workspaces/:namespace',
    { path: { apiVersion: NOTEBOOKS_API_VERSION, namespace: mockNamespace.name } },
    mockModArchResponse(mockWorkspaces),
  ).as('getWorkspaces');

  workspaces.visit();
  cy.wait('@getNamespaces');
  navBar.selectNamespace(mockNamespace.name);
  cy.wait('@getWorkspaces');
};

describe('Culling warnings', () => {
  it('shows a warning indicator when within 15 minutes of auto-pause', () => {
    // 18 min since activity, 30 min budget => 12 min remaining => warning
    setup([cullingWorkspace('warning-ws', 18)]);
    workspaces.assertWorkspaceRowCullingWarning(0);
  });

  it('shows a critical indicator when within 5 minutes of auto-pause', () => {
    // 27 min since activity, 30 min budget => 3 min remaining => critical
    setup([cullingWorkspace('critical-ws', 27)]);
    workspaces.assertWorkspaceRowCullingCritical(0);
  });

  it('shows no warning when activity is recent', () => {
    // 2 min since activity, 30 min budget => 28 min remaining => no warning
    setup([cullingWorkspace('healthy-ws', 2)]);
    workspaces.assertWorkspaceRowNoCullingWarning(0);
  });

  it('shows no warning for a workspace without culling config', () => {
    setup([
      buildMockWorkspace({
        name: 'no-culling-ws',
        state: V1Beta1WorkspaceState.WorkspaceStateRunning,
        activity: {
          lastActivity: Date.now() - 29 * 60 * 1000,
          lastUpdate: Date.now(),
        },
        workspaceKind: buildMockWorkspaceKindInfo({ cullingConfig: undefined }),
      }),
    ]);
    workspaces.assertWorkspaceRowNoCullingWarning(0);
  });

  it('shows no warning for a paused workspace even if it is past the threshold', () => {
    setup([
      buildMockWorkspace({
        name: 'paused-ws',
        state: V1Beta1WorkspaceState.WorkspaceStatePaused,
        activity: {
          lastActivity: Date.now() - 29 * 60 * 1000,
          lastUpdate: Date.now(),
        },
        workspaceKind: buildMockWorkspaceKindInfo({
          cullingConfig: { maxInactiveSeconds: MAX_INACTIVE_SECONDS },
        }),
      }),
    ]);
    workspaces.assertWorkspaceRowNoCullingWarning(0);
  });

  it('clears the warning when the next data refresh shows updated activity', () => {
    const mockNamespace = buildMockNamespace({ name: DEFAULT_NAMESPACE });

    cy.interceptApi(
      'GET /api/:apiVersion/namespaces',
      { path: { apiVersion: NOTEBOOKS_API_VERSION } },
      mockModArchResponse([mockNamespace]),
    ).as('getNamespaces');

    // First response: workspace is in warning state.
    cy.interceptApi(
      'GET /api/:apiVersion/workspaces/:namespace',
      { path: { apiVersion: NOTEBOOKS_API_VERSION, namespace: mockNamespace.name } },
      mockModArchResponse([cullingWorkspace('refresh-ws', 18)]),
    ).as('getWorkspaces');

    workspaces.visit();
    cy.wait('@getNamespaces');
    navBar.selectNamespace(mockNamespace.name);
    cy.wait('@getWorkspaces');
    workspaces.assertWorkspaceRowCullingWarning(0);

    // Second response (simulating the next poll): activity just happened, warning clears.
    cy.interceptApi(
      'GET /api/:apiVersion/workspaces/:namespace',
      { path: { apiVersion: NOTEBOOKS_API_VERSION, namespace: mockNamespace.name } },
      mockModArchResponse([cullingWorkspace('refresh-ws', 0)]),
    ).as('getWorkspacesRefreshed');

    workspaces.findRefreshButton().click();
    cy.wait('@getWorkspacesRefreshed');
    workspaces.assertWorkspaceRowNoCullingWarning(0);
  });
});
