import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { Alert, Button, Input } from '@/components/common'
import { useToast } from '@/context/ToastContext'
import { useDocumentTitle } from '@/hooks'
import { AuthCard, FormError } from '@/pages/auth/authFormParts'
import { adminPath } from '@/routes/navigation'
import { toApiError } from '@/services/api'
import { authService } from '@/services/auth.service'
import type { ApiError } from '@/types'
import { isEmail } from '@/utils/policy'

interface ForgotErrors {
  email?: string
}

export default function ForgotPasswordPage() {
  useDocumentTitle('Reset your password')

  const toast = useToast()

  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<ForgotErrors>({})
  const [formError, setFormError] = useState<ApiError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const next: ForgotErrors = {}
    if (!email.trim()) next.email = 'Enter your email address.'
    else if (!isEmail(email)) next.email = 'Enter a valid email address.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const address = email.trim()
    setSubmitting(true)
    try {
      await authService.forgotPassword(address)
      setSentTo(address)
      toast.success('Reset instructions sent', 'Check your inbox for the next steps.')
    } catch (error) {
      setFormError(toApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Check your email"
        subtitle="Password reset instructions are on their way."
        footer={
          <span>
            <Link className="font-medium text-brand-600 hover:underline" to={adminPath('/login')}>
              Back to sign in
            </Link>
          </span>
        }
      >
        <Alert tone="success" title="Request received">
          If an account exists for <span className="font-medium">{sentTo}</span>, an email with a
          single-use reset link has been sent. The link expires shortly after it is issued.
        </Alert>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter the email address associated with your account and we will send you a reset link."
      footer={
        <span>
          <Link className="font-medium text-brand-600 hover:underline" to={adminPath('/login')}>
            Back to sign in
          </Link>
        </span>
      }
    >
      <div className="space-y-5">
        {formError ? (
          <FormError error={formError} title="We could not send reset instructions" />
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
            required
          />

          <Button type="submit" fullWidth size="lg" loading={submitting}>
            Send reset link
          </Button>
        </form>

        <Alert tone="info">
          For your security, we always show the same confirmation — we never reveal whether an
          account exists for a given address.
        </Alert>
      </div>
    </AuthCard>
  )
}
