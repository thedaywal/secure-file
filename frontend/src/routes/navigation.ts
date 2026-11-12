import {
  BellRing,
  FolderLock,
  LayoutDashboard,
  MonitorSmartphone,
  Radio,
  Settings,
  Share2,
  ShieldPlus,
  Stamp,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Match the path exactly (used for the dashboard index route). */
  end?: boolean
  description?: string
}

export interface NavSection {
  id: string
  title: string
  items: NavItem[]
}

/** Path prefix the administrator console is mounted on; must mirror the backend ADMIN_CONSOLE_PATH setting. */
export const ADMIN_BASE = '/unknown'

/** Prefix a console-relative path with the admin base. Example: `adminPath('/files') -> '/unknown/files'`. */
export function adminPath(path: string): string {
  return path === '/' ? ADMIN_BASE : `${ADMIN_BASE}${path}`
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    items: [
      {
        label: 'Dashboard',
        to: ADMIN_BASE,
        icon: LayoutDashboard,
        end: true,
        description: 'Security posture and activity',
      },
    ],
  },
  {
    id: 'protect',
    title: 'Protect',
    items: [
      {
        label: 'Protected Files',
        to: adminPath('/files'),
        icon: FolderLock,
        end: true,
        description: 'File library and policies',
      },
      {
        label: 'Protect a File',
        to: adminPath('/files/new'),
        icon: ShieldPlus,
        description: 'Upload and configure protection',
      },
      {
        label: 'Shared Files',
        to: adminPath('/sharing'),
        icon: Share2,
        description: 'Recipient access and links',
      },
    ],
  },
  {
    id: 'monitor',
    title: 'Monitor',
    items: [
      {
        label: 'Access Monitoring',
        to: adminPath('/monitoring'),
        icon: Radio,
        description: 'Successful and blocked attempts',
      },
      {
        label: 'Devices',
        to: adminPath('/devices'),
        icon: MonitorSmartphone,
        description: 'Device evidence per session',
      },
    ],
  },
  {
    id: 'records',
    title: 'Records',
    items: [
      {
        label: 'Watermark Records',
        to: adminPath('/watermarks'),
        icon: Stamp,
        description: 'Recipient-scoped renditions',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account',
    items: [
      {
        label: 'Notifications',
        to: adminPath('/notifications'),
        icon: BellRing,
        description: 'Security alerts and preferences',
      },
      {
        label: 'Settings',
        to: adminPath('/settings'),
        icon: Settings,
        description: 'Account and security policies',
      },
    ],
  },
]
