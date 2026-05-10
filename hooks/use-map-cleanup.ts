'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook para gerenciar cleanup de mapas Leaflet e prevenir memory leaks
 */
export function useMapCleanup() {
  const mapInstanceRef = useRef<any>(null);
  const layersRef = useRef<Set<any>>(new Set());
  const timeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const intervalsRef = useRef<Set<ReturnType<typeof setInterval>>>(new Set());
  const isUnmountedRef = useRef(false);

  // Registrar layer para cleanup automático
  const registerLayer = useCallback((layer: any) => {
    if (layer && !isUnmountedRef.current) {
      layersRef.current.add(layer);
    }
  }, []);

  // Remover layer específico
  const removeLayer = useCallback((layer: any) => {
    if (layer) {
      try {
        if (layer.off) layer.off(); // Remove event listeners
        if (layer.unbindTooltip) layer.unbindTooltip();
        if (layer.unbindPopup) layer.unbindPopup();
        if (layer.remove) layer.remove();
        layersRef.current.delete(layer);
      } catch (e) {
        // Ignorar erros de cleanup
      }
    }
  }, []);

  // Registrar timeout para cleanup
  const safeTimeout = useCallback((fn: () => void, ms: number): NodeJS.Timeout => {
    const timeout = setTimeout(() => {
      if (!isUnmountedRef.current) {
        fn();
      }
      timeoutsRef.current.delete(timeout);
    }, ms);
    timeoutsRef.current.add(timeout);
    return timeout;
  }, []);

  // Registrar interval para cleanup
  const safeInterval = useCallback((fn: () => void, ms: number): ReturnType<typeof setInterval> => {
    const interval = setInterval(() => {
      if (!isUnmountedRef.current) {
        fn();
      }
    }, ms);
    intervalsRef.current.add(interval);
    return interval;
  }, []);

  // Cleanup completo do mapa
  const cleanupMap = useCallback(() => {
    // Limpar todos os layers
    layersRef.current.forEach(layer => {
      try {
        if (layer.off) layer.off();
        if (layer.unbindTooltip) layer.unbindTooltip();
        if (layer.unbindPopup) layer.unbindPopup();
        if (layer.remove) layer.remove();
      } catch (e) {
        // Ignorar erros
      }
    });
    layersRef.current.clear();

    // Limpar mapa
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
      } catch (e) {
        // Ignorar erros
      }
      mapInstanceRef.current = null;
    }
  }, []);

  // Cleanup em unmount
  useEffect(() => {
    isUnmountedRef.current = false;
    
    return () => {
      isUnmountedRef.current = true;
      
      // Limpar timeouts
      timeoutsRef.current.forEach(t => clearTimeout(t));
      timeoutsRef.current.clear();
      
      // Limpar intervals
      intervalsRef.current.forEach(i => clearInterval(i));
      intervalsRef.current.clear();
      
      // Cleanup do mapa
      cleanupMap();
    };
  }, [cleanupMap]);

  // useCallback garante referência estável — evita re-execução do initMap a cada render
  const isUnmounted = useCallback(() => isUnmountedRef.current, []);

  return {
    mapInstanceRef,
    registerLayer,
    removeLayer,
    cleanupMap,
    safeTimeout,
    safeInterval,
    isUnmounted,
  };
}

/**
 * Throttle function para limitar chamadas frequentes
 */
export function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  
  return ((...args: any[]) => {
    const now = Date.now();
    const remaining = ms - (now - lastCall);
    
    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}
