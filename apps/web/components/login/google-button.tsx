import { Button } from '@smlxl/ui'
import { googleSignInAction } from '@/app/(auth)/login/actions'

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  )
}

export function GoogleButton({ enabled, callbackUrl }: { enabled: boolean; callbackUrl: string }) {
  return (
    <form action={googleSignInAction} className="flex flex-col gap-2">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Button type="submit" size="lg" variant="outline" className="w-full justify-center gap-3 bg-surface" disabled={!enabled}>
        <GoogleMark />
        Continuar con Google Workspace
      </Button>
      {!enabled ? (
        <p className="text-xs text-muted-foreground">
          Google OAuth no está configurado (GOOGLE_OAUTH_CLIENT_ID / SECRET). En producción es el único método de acceso.
        </p>
      ) : null}
    </form>
  )
}
