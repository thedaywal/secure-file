import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { Alert, Button, Checkbox, Input, PasswordInput } from '@/components/common'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useDocumentTitle } from '@/hooks'
import { AuthCard, FormError } from '@/pages/auth/authFormParts'
import { ADMIN_BASE, adminPath } from '@/routes/navigation'
import { toApiError } from '@/services/api'
import type { ApiError } from '@/types'
import { isEmail } from '@/utils/policy'

interface LoginErrors {
  email?: string
  password?: string
}

export default function LoginPage() {
  useDocumentTitle('Sign in')

  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { login } = useAuth()

  // The root path belongs to the public recipient viewer, so default to the console.
  const from = (location.state as { from?: string } | null)?.from ?? ADMIN_BASE

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState<LoginErrors>({})
  const [formError, setFormError] = useState<ApiError | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validate = (): LoginErrors => {
    const next: LoginErrors = {}
    if (!isEmail(email)) next.email = 'Enter a valid email address.'
    if (!password) next.password = 'Enter your password.'
    return next
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const validation = validate()
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setSubmitting(true)
    try {
      await login({ email: email.trim(), password, remember })
      toast.success('Signed in', 'Welcome back to SecureFile.')
      navigate(from, { replace: true })
    } catch (error) {
      const apiError = toApiError(error)
      setFormError(apiError)
      if (apiError.fieldErrors) {
        setErrors({
          email: apiError.fieldErrors.email?.[0],
          password: apiError.fieldErrors.password?.[0],
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Administrator sign in"
      subtitle="Sign in to protect images, issue single-use access links and review watermark records."
      footer={
        <span>
          SecureFile is a single-administrator platform. Recipients never sign in here — they open
          their single-use access link.
        </span>
      }
    >
      <div className="space-y-5">
        {formError ? <FormError error={formError} title="We could not sign you in" /> : null}

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <Input
            label="Administrator email"
            type="email"
            autoComplete="email"
            placeholder="admin@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
            required
          />

          <div className="space-y-1.5">
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errors.password}
              required
            />
            <div className="flex justify-end">
              <Link
                className="text-[12.5px] font-medium text-brand-600 hover:underline"
                to={adminPath('/forgot-password')}
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <Checkbox
            label="Keep me signed in on this browser"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />

          <Button type="submit" fullWidth size="lg" loading={submitting}>
            Sign in
          </Button>
        </form>

        <Alert tone="info" title="Sign-in activity is recorded">
          Successful and failed sign-in attempts are logged with the device and IP address used. This
          is the only administrator account on the platform.
        </Alert>
      </div>
    </AuthCard>
  )
}
