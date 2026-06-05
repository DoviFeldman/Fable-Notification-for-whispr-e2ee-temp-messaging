import ServiceWorkerRegistration from './components/ServiceWorkerRegistration'

export const metadata = {
  title: 'whispr',
  description: 'temporary end-to-end encrypted chat',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#111111" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="whispr" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#111', WebkitTextSizeAdjust: '100%' }}>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  )
}
