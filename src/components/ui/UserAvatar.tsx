import React from 'react';
import type { AvatarConfig } from '../../lib/avatarTypes';

interface UserAvatarProps {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
}

// Darken/lighten a hex color by a factor (negative factor = lighten)
function adjustColor(hex: string, factor: number): string {
  if (!hex || typeof hex !== 'string') return '#000000';
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);

  if (factor > 0) {
    // Darken
    r = Math.round(r * (1 - factor));
    g = Math.round(g * (1 - factor));
    b = Math.round(b * (1 - factor));
  } else {
    // Lighten
    const f = Math.abs(factor);
    r = Math.round(r + (255 - r) * f);
    g = Math.round(g + (255 - g) * f);
    b = Math.round(b + (255 - b) * f);
  }

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ config, size = 48, className = '' }) => {
  if (!config) {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={{ borderRadius: size * 0.3 }}>
        <rect width="100" height="100" rx="30" fill="#E8E8E8" />
        <circle cx="50" cy="40" r="16" fill="#C0C0C0" />
        <path d="M 25 100 C 25 75, 75 75, 75 100 Z" fill="#C0C0C0" />
      </svg>
    );
  }

  const { style = 'neutral', skinColor = '#FDDCB5', bgColor, faceShape, hairStyle, hairColor, glasses, beard } = config;
  const isFeminine = style === 'feminine';
  const isMasculine = style === 'masculine';

  // Face dimensions
  const faceRx = faceShape === 'oval' ? 22 : 24;
  const faceRy = faceShape === 'oval' ? 28 : 24;

  // Colors
  const noseColor = adjustColor(skinColor, 0.15);
  const blushColor = adjustColor(skinColor, 0.1);
  const mouthBaseColor = adjustColor(skinColor, 0.2);
  const mouthColor = isFeminine ? '#D4707A' : mouthBaseColor;
  const mouthWidth = isFeminine ? '2.2' : '1.8';
  
  // Shadows and Depth
  const shadowColor = adjustColor(skinColor, 0.25);
  
  // Style-based adjustments
  const eyebrowWidth = isMasculine ? '2.5' : isFeminine ? '1.5' : '2';
  const eyebrowColor = adjustColor(hairColor || skinColor, 0.4);

  // Clothing Color
  const clothingColor = isMasculine ? '#2A4365' : isFeminine ? '#B83280' : '#4A5568';
  const clothingBase = adjustColor(clothingColor, 0.15);

  const defsId = `${bgColor.replace('#', '')}-${skinColor.replace('#', '')}-${style}-${hairColor.replace('#', '')}`;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={{ borderRadius: size * 0.3 }}>
      <defs>
        <linearGradient id={`bgGrad-${defsId}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={bgColor} />
          <stop offset="100%" stopColor={adjustColor(bgColor, 0.15)} />
        </linearGradient>
        <filter id={`dropShadow-${defsId}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.15" />
        </filter>
        <filter id={`softShadow-${defsId}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.2" />
        </filter>
        <linearGradient id={`clothGrad-${defsId}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={adjustColor(clothingColor, -0.1)} />
          <stop offset="100%" stopColor={clothingBase} />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="100" height="100" rx="30" fill={`url(#bgGrad-${defsId})`} />

      {/* Neck base shadow */}
      <rect x="38" y="55" width="24" height="30" fill={shadowColor} rx="6" />
      <rect x="38" y="55" width="24" height="26" fill={skinColor} rx="6" />

      {/* Bust / Clothing */}
      <path
        d="M 10 100 C 10 70, 90 70, 90 100 Z"
        fill={`url(#clothGrad-${defsId})`}
        filter={`url(#dropShadow-${defsId})`}
      />
      {/* Collar accent based on style */}
      {isFeminine ? (
        <path d="M 38 78 Q 50 88 62 78 L 62 81 Q 50 91 38 81 Z" fill={skinColor} opacity={0.6} />
      ) : isMasculine ? (
        <path d="M 38 78 L 50 90 L 62 78 L 65 80 L 50 95 L 35 80 Z" fill={adjustColor(clothingColor, 0.3)} />
      ) : (
        <path d="M 35 78 Q 50 85 65 78 L 65 82 Q 50 89 35 82 Z" fill={adjustColor(clothingColor, 0.3)} />
      )}

      {/* Ears */}
      <ellipse cx="26" cy="46" rx="5" ry="6" fill={shadowColor} />
      <ellipse cx="27" cy="46" rx="4" ry="5.5" fill={skinColor} />
      <ellipse cx="74" cy="46" rx="5" ry="6" fill={shadowColor} />
      <ellipse cx="73" cy="46" rx="4" ry="5.5" fill={skinColor} />
      
      {/* Earrings for feminine */}
      {isFeminine && (
        <g filter={`url(#softShadow-${defsId})`}>
          <circle cx="25" cy="54" r="2.5" fill="#E8B44C" />
          <circle cx="25" cy="53.5" r="1" fill="#FFF" opacity="0.6" />
          <circle cx="75" cy="54" r="2.5" fill="#E8B44C" />
          <circle cx="75" cy="53.5" r="1" fill="#FFF" opacity="0.6" />
        </g>
      )}

      {/* Face Base Shadow (for 3D effect of the head over the neck) */}
      <ellipse cx="50" cy="48" rx={faceRx} ry={faceRy} fill={shadowColor} filter={`url(#softShadow-${defsId})`} />
      {/* Face */}
      <ellipse cx="50" cy="47" rx={faceRx} ry={faceRy} fill={skinColor} />

      {/* Blush for feminine/neutral */}
      {(isFeminine || !isMasculine) && (
        <>
          <ellipse cx="34" cy="51" rx="5" ry="3" fill={blushColor} opacity="0.4" style={{ filter: 'blur(1px)' }} />
          <ellipse cx="66" cy="51" rx="5" ry="3" fill={blushColor} opacity="0.4" style={{ filter: 'blur(1px)' }} />
        </>
      )}

      {/* Hair (behind and on top of face) */}
      <g filter={`url(#softShadow-${defsId})`}>
        {renderHair(hairStyle, hairColor)}
      </g>

      {/* Eyes */}
      <ellipse cx="38" cy="44" rx="3.5" ry="4.5" fill="#2A2A2A" />
      <ellipse cx="62" cy="44" rx="3.5" ry="4.5" fill="#2A2A2A" />
      {/* Eye highlights */}
      <circle cx="39.5" cy="42.5" r="1.2" fill="white" opacity="0.9" />
      <circle cx="37" cy="45" r="0.6" fill="white" opacity="0.6" />
      <circle cx="63.5" cy="42.5" r="1.2" fill="white" opacity="0.9" />
      <circle cx="61" cy="45" r="0.6" fill="white" opacity="0.6" />

      {/* Eyelashes for feminine */}
      {isFeminine && (
        <g stroke="#2A2A2A" strokeWidth="1.2" strokeLinecap="round" fill="none">
          <path d="M 35 42 Q 33 39 32 39" />
          <path d="M 37 41.5 Q 35 38 35 37" />
          <path d="M 65 42 Q 67 39 68 39" />
          <path d="M 63 41.5 Q 65 38 65 37" />
        </g>
      )}

      {/* Eyebrows */}
      <path d="M31 38 Q38 35 43 38" stroke={eyebrowColor} strokeWidth={eyebrowWidth} fill="none" strokeLinecap="round" />
      <path d="M57 38 Q62 35 69 38" stroke={eyebrowColor} strokeWidth={eyebrowWidth} fill="none" strokeLinecap="round" />

      {/* Nose */}
      <path d="M48 50 Q50 54 52 50" stroke={noseColor} strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* Mouth */}
      <path d="M42 58 Q50 64 58 58" stroke={mouthColor} strokeWidth={mouthWidth} fill="none" strokeLinecap="round" />
      {/* Inner mouth subtle detail */}
      <path d="M44 58.5 Q50 61 56 58.5" stroke={adjustColor(mouthColor, 0.2)} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.7" />

      {/* Beard - only for masculine/neutral */}
      {beard && !isFeminine && renderBeard(hairColor)}

      {/* Glasses */}
      {glasses && renderGlasses()}
    </svg>
  );
};

function renderHair(style: AvatarConfig['hairStyle'], color: string) {
  // Add some highlight to hair
  const highlight = adjustColor(color, -0.15);
  
  switch (style) {
    case 'short':
      return (
        <g>
          <path d="M26 42 Q26 16 50 14 Q74 16 74 42 Q70 30 50 26 Q30 30 26 42" fill={color} />
          {/* Highlight */}
          <path d="M35 22 Q50 16 65 22" stroke={highlight} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.4" />
          <rect x="25" y="38" width="6" height="10" rx="3" fill={color} />
          <rect x="69" y="38" width="6" height="10" rx="3" fill={color} />
        </g>
      );

    case 'long':
      return (
        <g>
          {/* Back hair */}
          <path d="M22 40 Q22 16 50 14 Q78 16 78 40 L78 85 Q76 90 68 85 L68 40 Q66 26 50 24 Q34 26 32 40 L32 85 Q24 90 22 85 Z" fill={color} />
          {/* Front hair */}
          <path d="M24 40 Q24 14 50 12 Q76 14 76 40 Q72 30 50 28 Q28 30 24 40" fill={color} />
          {/* Highlight */}
          <path d="M35 22 Q50 16 65 22" stroke={highlight} strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.4" />
        </g>
      );

    case 'curly':
      return (
        <g>
          <circle cx="34" cy="24" r="11" fill={color} />
          <circle cx="50" cy="18" r="13" fill={color} />
          <circle cx="66" cy="24" r="11" fill={color} />
          <circle cx="26" cy="36" r="10" fill={color} />
          <circle cx="74" cy="36" r="10" fill={color} />
          <path d="M26 28 Q26 14 50 12 Q74 14 74 28 L74 45 Q60 32 50 32 Q40 32 26 45 Z" fill={color} />
          {/* Highlight clusters */}
          <circle cx="48" cy="14" r="3" fill={highlight} opacity="0.5" />
          <circle cx="32" cy="20" r="2.5" fill={highlight} opacity="0.5" />
          <circle cx="68" cy="20" r="2.5" fill={highlight} opacity="0.5" />
        </g>
      );

    case 'bald':
      return null;

    case 'mid':
      return (
        <g>
          <path d="M26 42 Q26 16 50 14 Q74 16 74 42 Q70 30 50 26 Q30 30 26 42" fill={color} />
          <path d="M25 40 L20 62 Q23 68 30 56 L30 40 Z" fill={color} />
          <path d="M75 40 L80 62 Q77 68 70 56 L70 40 Z" fill={color} />
          <path d="M35 22 Q50 16 65 22" stroke={highlight} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.4" />
        </g>
      );
  }
}

function renderBeard(color: string) {
  return (
    <g>
      <path
        d="M33 55 Q33 65 38 69 Q44 76 50 78 Q56 76 62 69 Q67 65 67 55 Q62 66 50 69 Q38 66 33 55"
        fill={color}
        opacity="0.95"
      />
      {/* Mustache */}
      <path
        d="M38 56 Q45 52 50 55 Q55 52 62 56 Q55 58 50 56 Q45 58 38 56"
        fill={color}
      />
    </g>
  );
}

function renderGlasses() {
  return (
    <g>
      {/* Frame base shadow */}
      <circle cx="38" cy="45" r="9" stroke="#000" strokeWidth="2.5" fill="none" opacity="0.2" />
      <circle cx="62" cy="45" r="9" stroke="#000" strokeWidth="2.5" fill="none" opacity="0.2" />
      
      {/* Frame */}
      <circle cx="38" cy="44" r="9" stroke="#3A3A3A" strokeWidth="2.5" fill="none" />
      <circle cx="62" cy="44" r="9" stroke="#3A3A3A" strokeWidth="2.5" fill="none" />
      
      {/* Bridge */}
      <path d="M47 43 Q50 41 53 43" stroke="#3A3A3A" strokeWidth="2.5" fill="none" />
      
      {/* Arms */}
      <line x1="29" y1="42" x2="22" y2="40" stroke="#3A3A3A" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="71" y1="42" x2="78" y2="40" stroke="#3A3A3A" strokeWidth="2.5" strokeLinecap="round" />
      
      {/* Glass Reflection */}
      <path d="M31 40 L36 36" stroke="#FFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M55 40 L60 36" stroke="#FFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </g>
  );
}

export default UserAvatar;
