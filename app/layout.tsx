import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CRM Sieci Handlowe',
  description: 'Pipeline sprzedażowy – sieci handlowe',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  )
}