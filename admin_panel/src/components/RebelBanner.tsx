'use client';

export function RebelBanner({ className = '' }: { className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden bg-black p-6 rounded-2xl border border-white/10 ${className}`}>
      {/* CRT Scanlines эффект */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 255, 0.05) 2px, rgba(0, 255, 255, 0.05) 4px)',
          animation: 'scanlines 0.1s linear infinite',
        }}
      />

      {/* Glitch эффект */}
      <div className="relative z-10">
        {/* Основной текст */}
        <div className="relative">
          {/* Rebel текст */}
          <div className="text-white/60 text-xs font-mono mb-3 tracking-[0.2em] uppercase">
            Rebel
          </div>

          {/* Bingo текст с глитч эффектом */}
          <div className="relative">
            {/* Glitch слои */}
            <div 
              className="absolute inset-0 text-white font-bold text-4xl md:text-5xl font-mono tracking-wider opacity-80"
              style={{
                textShadow: '2px 0 0 #ff00ff, -2px 0 0 #00ffff',
                animation: 'glitch-1 3s infinite',
                clipPath: 'inset(0 0 0 0)',
              }}
            >
              BINGO
            </div>
            
            {/* Основной текст */}
            <div 
              className="relative text-white font-bold text-4xl md:text-5xl font-mono tracking-wider"
              style={{
                textShadow: '0 0 10px rgba(255, 255, 255, 0.3), 0 0 20px rgba(255, 255, 255, 0.1)',
                filter: 'drop-shadow(0 0 5px rgba(255, 255, 255, 0.5))',
              }}
            >
              BINGO
            </div>
          </div>

          {/* KOTK текст с глитч эффектом */}
          <div className="relative mt-1">
            {/* Glitch слои */}
            <div 
              className="absolute inset-0 text-white font-bold text-4xl md:text-5xl font-mono tracking-wider opacity-80"
              style={{
                textShadow: '-2px 0 0 #ff00ff, 2px 0 0 #00ffff',
                animation: 'glitch-2 3s infinite 0.15s',
                clipPath: 'inset(0 0 0 0)',
              }}
            >
              KOTK
            </div>
            
            {/* Основной текст */}
            <div 
              className="relative text-white font-bold text-4xl md:text-5xl font-mono tracking-wider"
              style={{
                textShadow: '0 0 10px rgba(255, 255, 255, 0.3), 0 0 20px rgba(255, 255, 255, 0.1)',
                filter: 'drop-shadow(0 0 5px rgba(255, 255, 255, 0.5))',
              }}
            >
              KOTK
            </div>
          </div>
        </div>

        {/* Хроматическая аберрация эффект */}
        <div 
          className="absolute inset-0 pointer-events-none mix-blend-screen opacity-15"
          style={{
            background: 'linear-gradient(90deg, rgba(255, 0, 255, 0.1) 0%, transparent 50%, rgba(0, 255, 255, 0.1) 100%)',
            animation: 'chromatic 4s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  );
}

