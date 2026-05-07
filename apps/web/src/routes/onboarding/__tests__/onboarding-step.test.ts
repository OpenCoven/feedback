import { describe, it, expect } from 'vitest'
import { pickOnboardingStep } from '../onboarding-step'

describe('pickOnboardingStep', () => {
  it('routes unauthenticated visitors to /onboarding/account', () => {
    expect(pickOnboardingStep({ session: null, state: null })).toBe('/onboarding/account')
  })

  it('routes invitees to /auth/login', () => {
    expect(
      pickOnboardingStep({
        session: { userId: 'u1' },
        state: { needsInvitation: true, setupState: null, principalRecord: null },
      })
    ).toBe('/auth/login')
  })

  it('routes mid-wizard users to /onboarding/boards when useCase + workspace are both done', () => {
    expect(
      pickOnboardingStep({
        session: { userId: 'u1' },
        state: {
          setupState: {
            version: 1,
            source: 'self-hosted',
            useCase: 'saas',
            steps: { core: false, workspace: true, boards: false },
          },
          principalRecord: { id: 'p1', role: 'admin' },
        },
      })
    ).toBe('/onboarding/boards')
  })

  it('routes users with a useCase but no workspace to /onboarding/workspace', () => {
    expect(
      pickOnboardingStep({
        session: { userId: 'u1' },
        state: {
          setupState: {
            version: 1,
            source: 'self-hosted',
            useCase: 'saas',
            steps: { core: false, workspace: false, boards: false },
          },
          principalRecord: { id: 'p1', role: 'admin' },
        },
      })
    ).toBe('/onboarding/workspace')
  })

  it('routes cloud-seeded workspace WITHOUT useCase back to /onboarding/usecase', () => {
    // Regression: when CP pre-seeds setupState.steps.workspace via
    // /api/v1/admin/setup but the cloud signup form didn't capture a
    // useCase, the wizard's dynamic stepper showed Use case as a
    // remaining step but pickOnboardingStep used to drop the user
    // straight on /onboarding/boards — silently checking off Use case.
    // First-incomplete ordering keeps stepper + router agreed.
    expect(
      pickOnboardingStep({
        session: { userId: 'u1' },
        state: {
          setupState: {
            version: 1,
            source: 'cloud',
            steps: { core: true, workspace: true, boards: false },
          },
          principalRecord: { id: 'p1', role: 'admin' },
        },
      })
    ).toBe('/onboarding/usecase')
  })

  it('falls back to /onboarding/usecase when nothing has been chosen', () => {
    expect(
      pickOnboardingStep({
        session: { userId: 'u1' },
        state: { setupState: null, principalRecord: null },
      })
    ).toBe('/onboarding/usecase')
  })
})
