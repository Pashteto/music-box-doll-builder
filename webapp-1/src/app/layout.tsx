import type { Metadata, Viewport } from 'next'
import './globals.css'
import { APP_NAME } from '@/lib/hello'

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Assemble a customizable virtual doll, render a short looping video, and share it.',
}

// Mobile-first viewport: cover the notch/safe-area and lock zoom for a native feel.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#6366f1',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
