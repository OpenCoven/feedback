/**
 * Status mapping resolution.
 *
 * Maps external platform status names to OpenCoven Feedback StatusIds
 * using the statusMappings stored in integrations.config.
 */

import type { StatusId } from '@opencoven-feedback/ids'

/**
 * Status mappings stored in integrations.config.statusMappings.
 * Key = external status name (case-sensitive as received from platform).
 * Value = OpenCoven Feedback StatusId or null (ignore this status).
 */
export type StatusMappings = Record<string, string | null>

/**
 * Resolve an external status name to a OpenCoven Feedback StatusId.
 * Returns null if no mapping exists or the mapping explicitly says to ignore.
 */
export function resolveStatusMapping(
  externalStatus: string,
  mappings: StatusMappings | undefined
): StatusId | null {
  if (!mappings) return null

  const mapped = mappings[externalStatus]
  if (mapped === undefined || mapped === null) return null

  return mapped as StatusId
}
