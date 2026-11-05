import React from 'react';
import { TRACK_HEIGHT, TRACK_WIDTH, getTrackPose, getTrackPolyline } from './track-layouts.js';

export default function TrackMiniMap({ trackKey, label }) {
  const points = getTrackPolyline(trackKey);
  const start = getTrackPose(trackKey, 0);
  const halfWidth = 39;
  return (
    <svg className={`track-map-svg track-map-${trackKey}`} viewBox={`0 0 ${TRACK_WIDTH} ${TRACK_HEIGHT}`} role="img" aria-label={label || `${trackKey} top-down circuit`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id={`grass-${trackKey}`} width="42" height="42" patternUnits="userSpaceOnUse">
          <path d="M0 21H42 M21 0V42" stroke="rgba(255,255,255,.035)" strokeWidth="1" />
          <circle cx="8" cy="9" r="1.8" fill="rgba(255,255,255,.06)" />
          <circle cx="31" cy="32" r="1.3" fill="rgba(0,0,0,.09)" />
        </pattern>
      </defs>
      <rect width={TRACK_WIDTH} height={TRACK_HEIGHT} fill="#31513d" />
      <rect width={TRACK_WIDTH} height={TRACK_HEIGHT} fill={`url(#grass-${trackKey})`} />
      <polyline points={points} fill="none" stroke="#17231e" strokeWidth="112" strokeLinecap="round" strokeLinejoin="round" opacity=".52" />
      <polyline points={points} fill="none" stroke="#e4e3d7" strokeWidth="96" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke="#d84e42" strokeWidth="96" strokeDasharray="25 25" strokeLinecap="butt" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke="#30383b" strokeWidth="78" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke="#a8b0ae" strokeWidth="2" strokeDasharray="3 16" strokeLinecap="round" opacity=".68" />
      <g transform={`translate(${start.x} ${start.y}) rotate(${(start.angle * 180) / Math.PI})`}>
        {Array.from({ length: 8 }, (_, index) => <rect key={index} x={-42 + index * 10.5} y={-5} width="5.25" height="10" fill={index % 2 ? '#f4f2e8' : '#172027'} />)}
      </g>
      <g transform={`translate(${start.x + start.normal.x * (halfWidth + 27)} ${start.y + start.normal.y * (halfWidth + 27)})`}>
        <circle r="9" fill="#ff7546" stroke="#fff1df" strokeWidth="3" />
      </g>
    </svg>
  );
}
