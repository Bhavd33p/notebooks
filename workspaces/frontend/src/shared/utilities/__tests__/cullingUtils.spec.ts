import { buildMockWorkspace, buildMockWorkspaceKindInfo } from '~/shared/mock/mockBuilder';
import { V1Beta1WorkspaceState } from '~/generated/data-contracts';
import {
  getCullingWarningLevel,
  getMsUntilCull,
  formatTimeUntilCull,
} from '~/shared/utilities/cullingUtils';

const NOW = new Date('2026-06-21T12:00:00.000Z').getTime();

// helper: build a running workspace whose last activity was `secondsAgo` ago,
// with a culling config of `maxInactiveSeconds`.
const buildCullingWorkspace = (secondsAgo: number, maxInactiveSeconds = 30 * 60) =>
  buildMockWorkspace({
    state: V1Beta1WorkspaceState.WorkspaceStateRunning,
    activity: {
      // lastActivity is in milliseconds (frontend convention)
      lastActivity: NOW - secondsAgo * 1000,
      lastUpdate: NOW,
    },
    workspaceKind: buildMockWorkspaceKindInfo({
      cullingConfig: { maxInactiveSeconds },
    }),
  });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getCullingWarningLevel', () => {
  it('returns null for a non-running workspace', () => {
    const ws = buildCullingWorkspace(29 * 60);
    ws.state = V1Beta1WorkspaceState.WorkspaceStatePaused;
    expect(getCullingWarningLevel(ws)).toBeNull();
  });

  it('returns null when the workspace kind has no culling config', () => {
    const ws = buildMockWorkspace({
      state: V1Beta1WorkspaceState.WorkspaceStateRunning,
      workspaceKind: buildMockWorkspaceKindInfo({ cullingConfig: undefined }),
    });
    expect(getCullingWarningLevel(ws)).toBeNull();
  });

  it('returns null when activity is recent (far from culling)', () => {
    // active 1 min ago, 30 min budget => ~29 min remaining
    expect(getCullingWarningLevel(buildCullingWorkspace(60))).toBeNull();
  });

  it("returns 'warning' when within 15 minutes of culling", () => {
    // active 18 min ago, 30 min budget => 12 min remaining
    expect(getCullingWarningLevel(buildCullingWorkspace(18 * 60))).toBe('warning');
  });

  it("returns 'critical' when within 5 minutes of culling", () => {
    // active 27 min ago, 30 min budget => 3 min remaining
    expect(getCullingWarningLevel(buildCullingWorkspace(27 * 60))).toBe('critical');
  });

  it("returns 'critical' when already past the culling threshold", () => {
    // active 40 min ago, 30 min budget => already overdue
    expect(getCullingWarningLevel(buildCullingWorkspace(40 * 60))).toBe('critical');
  });
});

describe('getMsUntilCull', () => {
  it('returns null for a non-running workspace', () => {
    const ws = buildCullingWorkspace(60);
    ws.state = V1Beta1WorkspaceState.WorkspaceStateError;
    expect(getMsUntilCull(ws)).toBeNull();
  });

  it('returns remaining milliseconds until culling', () => {
    // active 10 min ago, 30 min budget => 20 min remaining
    expect(getMsUntilCull(buildCullingWorkspace(10 * 60))).toBe(20 * 60 * 1000);
  });
});

describe('formatTimeUntilCull', () => {
  it('formats remaining time rounded up to whole minutes', () => {
    // active 27.5 min ago, 30 min budget => 2.5 min remaining => "3 min"
    expect(formatTimeUntilCull(buildCullingWorkspace(27.5 * 60))).toBe('3 min');
  });

  it('returns an empty string when there is no culling config', () => {
    const ws = buildMockWorkspace({
      state: V1Beta1WorkspaceState.WorkspaceStateRunning,
      workspaceKind: buildMockWorkspaceKindInfo({ cullingConfig: undefined }),
    });
    expect(formatTimeUntilCull(ws)).toBe('');
  });
});
