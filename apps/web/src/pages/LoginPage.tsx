import { LogIn } from 'lucide-react';
import { useState } from 'react';

import { SimuniLogo } from '../components/SimuniLogo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../state/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password, rememberMe);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prijava ni uspela.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white/95 p-7 shadow-xl ring-1 ring-brand/10 backdrop-blur">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand">
            <SimuniLogo className="h-7 w-auto text-white" />
          </div>
          <h1 className="text-xl font-semibold text-brand-dark">Šimuni Bungalov 41</h1>
          <p className="mt-1 text-sm text-brand/70">Prijavite se za nadaljevanje</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-brand-dark">
              Uporabniško ime
            </span>
            <Input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-brand-dark">Geslo</span>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-brand/30 text-brand focus:ring-brand"
            />
            <span className="text-sm text-brand-dark/80">Zapomni si me</span>
          </label>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <Button type="submit" size="lg" fullWidth disabled={submitting} icon={LogIn}>
            {submitting ? 'Prijavljam…' : 'Prijava'}
          </Button>
        </form>
      </div>
    </div>
  );
}
