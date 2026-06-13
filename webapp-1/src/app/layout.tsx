import type { Metadata, Viewport } from 'next'
import { Fraunces, Mulish } from 'next/font/google'
import './globals.css'
import { APP_NAME } from '@/lib/hello'
import { SessionInit } from '@/modules/auth/SessionInit'

// Display serif (echoes the artist's exhibition-poster type) + warm humanist body.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  style: ['normal', 'italic'],
})
const mulish = Mulish({
  subsets: ['latin'],
  variable: '--font-mulish',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://lindentar.pashteto.com'),
  title: APP_NAME,
  description: 'Assemble a customizable virtual doll, render a short looping video, and share it.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: { url: '/icon-180.png', sizes: '180x180', type: 'image/png' },
  },
  openGraph: {
    title: APP_NAME,
    description:
      'Assemble a customizable virtual doll, render a short looping video, and share it.',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630 }],
  },
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
    <html lang="en" className={`${fraunces.variable} ${mulish.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SessionInit />
        {children}
      </body>
    </html>
  )
}
