import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: '' | 'success' | 'err';
  onClose: () => void;
}

export default function Toast({ message, type = '', onClose }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className={`toast show${type ? ` t-${type}` : ''}`}>
      {message}
    </div>
  );
}