import Link from 'next/link'
import { Compass } from 'lucide-react'
import { Button, EmptyState } from '@smlxl/ui'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-xl items-center px-6">
      <EmptyState
        icon={Compass}
        title="Esta página no existe"
        description="La ruta que abriste no corresponde a ninguna pantalla de la plataforma."
        action={
          <Button asChild>
            <Link href="/inicio">Ir al inicio</Link>
          </Button>
        }
        className="w-full"
      />
    </main>
  )
}
