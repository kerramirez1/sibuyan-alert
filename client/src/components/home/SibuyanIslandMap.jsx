import { memo, useState } from 'react';

/**
 * Displays the actual Sibuyan Island municipality map image.
 * Source file: /public/icons/Municipality.png
 *
 * The image is preloaded from index.html so the browser discovers it during
 * HTML parse instead of after the app JS boots. Until it arrives, a subtle
 * tint holds the frame's shape so the area never looks blank, then the image
 * fades in on load. No spinner: this is a static illustration, not a pending
 * request.
 */
const SibuyanIslandMap = memo(() => {
    const [isLoaded, setIsLoaded] = useState(false);

    return (
        <div
            className="relative mx-auto w-full max-w-[210px] min-[430px]:max-w-[270px] sm:max-w-[360px] lg:max-w-[450px] xl:max-w-[500px]"
            role="img"
            aria-label="Map of Sibuyan Island showing Cajidiocan, Magdiwang, and San Fernando municipalities"
            data-testid="sibuyan-island-map"
        >
            {/* Flat hairline frame — no decorative corner brackets/crosshairs. */}
            <div className="relative border border-brand-200 bg-white p-2 dark:border-white/10 dark:bg-white/5">
                {/* Decorative placeholder wash behind the illustration; the img
                    keeps its width/height attributes so this never shifts layout. */}
                <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-2 bg-brand-50 transition-opacity duration-500 dark:bg-white/10 ${
                        isLoaded ? 'opacity-0' : 'opacity-100'
                    }`}
                />
                <img
                    src="/icons/Municipality.png"
                    alt="Sibuyan Island municipality boundaries — Cajidiocan, Magdiwang, and San Fernando"
                    className={`relative block h-auto w-full object-contain transition-opacity duration-500 ${
                        isLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    width={640}
                    height={530}
                    onLoad={() => setIsLoaded(true)}
                    onError={() => setIsLoaded(true)}
                />
            </div>
        </div>
    );
});

SibuyanIslandMap.displayName = 'SibuyanIslandMap';

export default SibuyanIslandMap;
