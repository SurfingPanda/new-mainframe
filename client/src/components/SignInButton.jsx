import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// A sign-in CTA that shows a brief loading state (click pulse + spinner) before
// navigating, so the jump to the sign-in page feels intentional. The SignIn page
// then plays its own entrance animation.
export default function SignInButton({ to = '/signin', className = 'btn-primary', children, beforeNavigate, delay = 480 }) {
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);

  const launch = (e) => {
    e.preventDefault();
    if (launching) return;
    beforeNavigate?.();
    setLaunching(true);
    window.setTimeout(() => navigate(to), delay);
  };

  return (
    <a
      href={to}
      onClick={launch}
      aria-busy={launching}
      className={`${className} ${launching ? 'btn-launching' : ''}`}
    >
      {launching ? (
        <>
          <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Signing in…
        </>
      ) : (
        children
      )}
    </a>
  );
}
