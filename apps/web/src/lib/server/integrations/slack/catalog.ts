import type { IntegrationCatalogEntry } from '../types'

export const slackCatalog: IntegrationCatalogEntry = {
  id: 'slack',
  name: 'Slack',
  description:
    'Send feedback from Slack to OpenCoven Feedback with a message shortcut, monitor channels for automatic feedback ingestion, and get notified when statuses change or comments are added.',
  category: 'notifications',
  capabilities: [
    {
      label: 'Send to OpenCoven Feedback shortcut',
      description:
        'Right-click any Slack message to send it to OpenCoven Feedback as feedback with a title, details, and board',
    },
    {
      label: 'Channel notifications',
      description:
        'Post messages to a Slack channel when feedback is submitted, statuses change, or comments are added',
    },
    {
      label: 'Channel monitoring',
      description:
        'Automatically ingest messages from monitored Slack channels as feedback, filtered by AI',
    },
    {
      label: 'Rich message formatting',
      description:
        'Messages include feedback title, author, status changes, and a direct link back to your portal',
    },
  ],
  iconBg: 'bg-[#4A154B]',
  settingsPath: '/admin/settings/integrations/slack',
  available: true,
  configurable: true,
  docsUrl: 'https://www.quackback.io/docs/integrations/slack',
}
