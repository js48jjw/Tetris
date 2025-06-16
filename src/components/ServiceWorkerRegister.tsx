"use client";

import { useEffect } from 'react';

const ServiceWorkerRegister = () => {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').then(registration => {
          console.log('Service Worker registered with scope:', registration.scope);
        }).catch(error => {
          console.error('Service Worker registration failed:', error);
        });
      });
    }
  }, []);

  return null; // 이 컴포넌트는 UI를 렌더링하지 않습니다.
};

export default ServiceWorkerRegister; 