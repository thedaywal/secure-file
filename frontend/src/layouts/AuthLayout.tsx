import { Outlet } from 'react-router-dom'
import { Fingerprint, KeyRound, Lock, ShieldCheck } from 'lucide-react'

const HIGHLIGHTS = [
  {
    icon: KeyRound,
    title: 'AES-256-GCM everywhere',
    description: 'Every file is encrypted at rest; keys never leave the backend.',
  },
  {
    icon: Fingerprint,
    title: 'Recipient-scoped access',
    description: 'Email verification, OTP and device binding before a single byte is served.',
  },
  {
    icon: ShieldCheck,
    title: 'Permanent watermarking',
    description: 'Recipient identity is baked into the rendition the recipient receives.',
  },
]

/** Split-screen shell used by every unauthenticated page. */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Brand panel */}
      <aside className="relative hidden w-[46%] max-w-xl flex-col justify-between overflow-hidden bg-navy-900 p-10 lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.09]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div
          aria-hidden
          className="absolute -top-24 -right-24 size-72 rounded-full bg-brand-600/25 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <Lock size={17} strokeWidth={2.4} />
          </span>
          <span>
            <span className="block text-[15px] leading-5 font-semibold text-white">SecureFile</span>
            <span className="block text-[11px] tracking-wide text-navy-500 uppercase">
              Protected delivery
            </span>
          </span>
        </div>

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-2xl leading-8 font-semibold text-white">
              Share sensitive documents without losing control of them.
            </h2>
            <p className="text-[13.5px] leading-6 text-slate-400">
              Track who opened each file, from which device, and block access the moment a link is
              forwarded to the wrong person.
            </p>
          </div>

          <ul className="space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-brand-300 ring-1 ring-white/10">
                  <item.icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-slate-200">{item.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-5 text-navy-500">
                    {item.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11.5px] text-navy-500">
          SOC 2 aligned controls · Audit-logged access · GDPR-ready data handling
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2.5 border-b border-line bg-surface px-5 py-3.5 lg:hidden">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <Lock size={15} strokeWidth={2.4} />
          </span>
          <span className="text-[14px] font-semibold text-ink">SecureFile</span>
        </div>

        <div className="scrollbar-slim flex flex-1 items-center justify-center overflow-y-auto px-5 py-10">
          <div className="w-full max-w-[420px]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
