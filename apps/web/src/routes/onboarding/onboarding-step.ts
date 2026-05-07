import type { SetupState } from '@/lib/shared/db-types'

interface OnboardingStateInput {
  needsInvitation?: boolean
  setupState: SetupState | null
  principalRecord: { id: string; role: string } | null
}

interface PickStepInput {
  session: { userId: string } | null
  state: OnboardingStateInput | null
}

/** Step targets the onboarding flow can route to. Pure string union so
 *  the loader can swap between server-fn redirects and tests can assert. */
export type OnboardingStep =
  | '/admin'
  | '/auth/login'
  | '/onboarding/account'
  | '/onboarding/boards'
  | '/onboarding/usecase'
  | '/onboarding/workspace'

export function pickOnboardingStep({ session, state }: PickStepInput): OnboardingStep {
  if (!session?.userId) return '/onboarding/account'
  if (!state) return '/onboarding/usecase'

  if (state.needsInvitation) return '/auth/login'

  // Route to the FIRST incomplete step in wizard order. Earlier versions
  // jumped to /onboarding/boards as soon as setupState.steps.workspace
  // was true — fine when both got filled in by the same wizard pass, but
  // the cloud control plane can pre-seed the workspace step alone (via
  // /api/v1/admin/setup) without a useCase, and the user then needs to
  // pick one. Skipping it left useCase silently false-checkmarked in
  // the dynamic stepper.
  if (!state.setupState?.useCase) return '/onboarding/usecase'
  if (!state.setupState?.steps?.workspace) return '/onboarding/workspace'
  return '/onboarding/boards'
}
