import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { prepareOperationalMapStyle } from '../../config/mapProvider';

const SIBUYAN_CENTER = [122.5571, 12.4176];

const Landing3DMapPreview = () => {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let active = true;
        let resizeObserver = null;

        const initialize = async () => {
            if (!containerRef.current || typeof window.WebGLRenderingContext === 'undefined') return;

            const provider = await prepareOperationalMapStyle({
                enableTerrain: true,
                includeStreet: false,
            });
            if (!active || !containerRef.current) return;

            const map = new maplibregl.Map({
                container: containerRef.current,
                style: provider.style,
                center: SIBUYAN_CENTER,
                zoom: 10.35,
                pitch: 58,
                bearing: -24,
                antialias: true,
                interactive: false,
                attributionControl: false,
                fadeDuration: 0,
            });
            mapRef.current = map;

            map.once('idle', () => {
                if (active) setIsReady(true);
            });

            if (typeof ResizeObserver !== 'undefined') {
                resizeObserver = new ResizeObserver(() => map.resize());
                resizeObserver.observe(containerRef.current);
            }
        };

        initialize().catch(() => {
            // The local image underneath remains visible if WebGL or map tiles are unavailable.
        });

        return () => {
            active = false;
            resizeObserver?.disconnect();
            mapRef.current?.remove();
            mapRef.current = null;
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className={`absolute inset-0 transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden="true"
        />
    );
};

export default Landing3DMapPreview;
