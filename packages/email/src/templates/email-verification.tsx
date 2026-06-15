import { Button, Heading, Link, Section, Text } from '@react-email/components'
import { EmailLayout, TransactionalFooter } from './email-layout'
import { typography, button, utils } from './shared-styles'

interface EmailVerificationEmailProps {
  verificationUrl: string
  logoUrl?: string
}

export function EmailVerificationEmail({
  verificationUrl,
  logoUrl,
}: EmailVerificationEmailProps) {
  return (
    <EmailLayout preview="Verify your Quackback email" logoUrl={logoUrl}>
      <Heading style={{ ...typography.h1, textAlign: 'center' }}>Verify your email</Heading>
      <Text style={{ ...typography.text, textAlign: 'center' }}>
        Click the button below to verify your email address and finish setting up your account.
      </Text>

      <Section style={{ textAlign: 'center', marginTop: '32px', marginBottom: '32px' }}>
        <Button style={button.primary} href={verificationUrl}>
          Verify Email
        </Button>
      </Section>

      <Text style={typography.textSmall}>
        Or copy and paste this link into your browser:{' '}
        <Link href={verificationUrl} style={utils.link}>
          {verificationUrl}
        </Link>
      </Text>

      <TransactionalFooter>
        If you didn&apos;t create an account, you can safely ignore this email.
      </TransactionalFooter>
    </EmailLayout>
  )
}
