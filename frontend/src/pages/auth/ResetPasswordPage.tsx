import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { Button, ErrorState, PasswordInput } from '@/components/common'
import { useToast } from '@/context/ToastContext'
import { useDocumentTitle } from '@/hooks'
import {
  AuthCard,
  FormError,
  PASSWORD_MIN_LENGTH,
  PasswordStrength,
} from '@/pages/auth/authFormParts'
import { adminPath } from '@/routes/navigation'
import { toApiError } from '@/services/api'
import { authService } from '@/services/auth.service'
import type { ApiError } from '@/types'

interface ResetErrors {
  password?: string
  confirmPassword?: string
}

export default function ResetPasswordPage() {
  useDocumentTitle('Set a new password')

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()

  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<ResetErrors>({})
  const [formError, setFormError] = useState<ApiError | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const next: ResetErrors = {}
    if (password.length < PASSWORD_MIN_LENGTH) {
      next.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`
    }
    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (!token) return

    setSubmitting(true)
    try {
      await authService.resetPassword(token, password)
      toast.success('Password updated', 'Sign in with your new password.')
      navigate(adminPath('/login'))
    } catch (error) {
      setFormError(toApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <AuthCard title="Reset link is invalid" subtitle="This password reset link cannot be used.">
        <ErrorState
          title="This reset link is invalid or has expired"
          description="Reset links are single-use and expire shortly after they are issued. Request a new link to continue."
          onRetry={() => navigate(adminPath('/forgot-password'))}
          retryLabel="Request a new link"
        />
        <p className="text-center text-[13px] text-ink-muted">
          <Link className="font-medium text-brand-600 hover:underline" to={adminPath('/login')}>
            Back to sign in
          </Link>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Set a new password"
      subtitle="Choose a strong password you have not used before."
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
          <FormError error={formError} title="We could not reset your password" />
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <PasswordInput
              label="New password"
              autoComplete="new-password"
              placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errors.password}
              required
            />
            <PasswordStrength password={password} />
          </div>

          <PasswordInput
            label="Confirm new password"
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={errors.confirmPassword}
            required
          />

          <Button type="submit" fullWidth size="lg" loading={submitting}>
            Reset password
          </Button>
        </form>
      </div>
    </AuthCard>
  )
}
