import React, { useEffect, useRef } from 'react';
import { Content, ContentVariants } from '@patternfly/react-core/dist/esm/components/Content';
import { PageSection } from '@patternfly/react-core/dist/esm/components/Page';
import { Stack, StackItem } from '@patternfly/react-core/dist/esm/layouts/Stack';
import { useNotification } from 'mod-arch-core';
import WorkspaceTable from '~/app/components/WorkspaceTable';
import { useWorkspacesByNamespace } from '~/app/hooks/useWorkspaces';
import { useNamespaceSelectorWrapper } from '~/app/hooks/useNamespaceSelectorWrapper';
import { LoadingSpinner } from '~/app/components/LoadingSpinner';
import { LoadError } from '~/app/components/LoadError';
import { useWorkspaceRowActions } from '~/app/hooks/useWorkspaceRowActions';
import {
  getCullingWarningLevel,
  formatTimeUntilCull,
  CullingWarningLevel,
} from '~/shared/utilities/cullingUtils';
import { V1Beta1WorkspaceState } from '~/generated/data-contracts';

export const Workspaces: React.FunctionComponent = () => {
  const { namespacesLoaded, selectedNamespace } = useNamespaceSelectorWrapper();
  const notification = useNotification();
  const notifiedLevels = useRef<Map<string, CullingWarningLevel>>(new Map());

  const [workspaces, workspacesLoaded, workspacesLoadError, refreshWorkspaces] =
    useWorkspacesByNamespace(selectedNamespace);

  // Notify the user when a workspace newly enters a culling warning/critical state.
  // Warnings clear automatically: when the next poll shows updated activity, the
  // computed level returns to null and no further toast is shown.
  useEffect(() => {
    workspaces.forEach((ws) => {
      const key = `${ws.namespace}/${ws.name}`;
      const level = getCullingWarningLevel(ws);
      const prev = notifiedLevels.current.get(key);
      if (level === prev) {
        return;
      }
      notifiedLevels.current.set(key, level);
      if (level === 'critical') {
        notification.warning(
          `Workspace "${ws.name}" will be auto-paused in ${formatTimeUntilCull(ws)} due to inactivity.`,
        );
      } else if (level === 'warning') {
        notification.info(
          `Workspace "${ws.name}" will be auto-paused in ${formatTimeUntilCull(ws)} due to inactivity.`,
        );
      }
    });
  }, [workspaces, notification]);

  const tableRowActions = useWorkspaceRowActions([
    { id: 'viewDetails' },
    { id: 'edit' },
    { id: 'delete', onActionDone: refreshWorkspaces },
    { id: 'separator' },
    {
      id: 'stop',
      isVisible: (w) => w.state === V1Beta1WorkspaceState.WorkspaceStateRunning,
      onActionDone: refreshWorkspaces,
    },
    {
      id: 'start',
      isVisible: (w) => w.state !== V1Beta1WorkspaceState.WorkspaceStateRunning,
      onActionDone: refreshWorkspaces,
    },
    {
      id: 'restart',
      isVisible: (w) => w.state === V1Beta1WorkspaceState.WorkspaceStateRunning,
      onActionDone: refreshWorkspaces,
    },
  ]);

  if (workspacesLoadError) {
    return <LoadError title="Failed to load workspaces" error={workspacesLoadError} />;
  }

  if (!workspacesLoaded || !namespacesLoaded || selectedNamespace === '') {
    return <LoadingSpinner />;
  }

  return (
    <PageSection isFilled>
      <Stack hasGutter>
        <StackItem>
          <Content component={ContentVariants.h1} data-testid="app-page-title">
            Workspaces
          </Content>
        </StackItem>
        <StackItem>
          <Content component={ContentVariants.p}>
            View your existing workspaces or create new workspaces.
          </Content>
        </StackItem>
        <StackItem isFilled>
          <WorkspaceTable
            workspaces={workspaces}
            rowActions={tableRowActions}
            namespace={selectedNamespace}
            hiddenColumns={['namespace', 'gpu', 'idleGpu']}
            refreshWorkspaces={refreshWorkspaces}
          />
        </StackItem>
      </Stack>
    </PageSection>
  );
};
