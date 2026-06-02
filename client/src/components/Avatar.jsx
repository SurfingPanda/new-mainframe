// Profile avatar: shows the uploaded picture when available, otherwise the
// user's initials on the brand background. `size` is a Tailwind h/w pair so
// callers control the dimensions (e.g. "h-9 w-9").
export default function Avatar({ name, src, size = 'h-9 w-9', textClass = 'text-sm', className = '' }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || 'User'}
        className={`${size} rounded-full object-cover bg-slate-100 ring-1 ring-inset ring-black/5 ${className}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex ${size} items-center justify-center rounded-full bg-brand-900 font-bold text-white dark:bg-brand-600 ${textClass} ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}

function initialsOf(name) {
  return (name || 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
