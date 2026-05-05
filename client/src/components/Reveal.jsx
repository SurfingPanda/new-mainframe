import { useEffect, useRef, useState } from 'react';

export default function Reveal({
  children,
  direction = 'up',
  delay = 0,
  duration,
  threshold = 0.15,
  once = false,
  className = '',
  as: Tag = 'div'
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) obs.unobserve(el);
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold, rootMargin: '-8% 0px -8% 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);

  const style = {};
  if (delay) style.transitionDelay = `${delay}ms`;
  if (duration) style.transitionDuration = `${duration}ms`;

  return (
    <Tag
      ref={ref}
      style={Object.keys(style).length ? style : undefined}
      className={`reveal reveal-${direction} ${visible ? 'reveal-in' : ''} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}
