import React, { useMemo } from 'react';

const WIDTH = 560;
const HEIGHT = 460;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 + 30 };
const RING_R = 150;
const BACKEND = { x: WIDTH / 2, y: 46 };

const OUTCOME_COLOR = {
  SETTLED: 'var(--settled)',
  DUPLICATE_DROPPED: 'var(--text-muted)',
  INVALID: 'var(--alert)'
};

function ringPosition(index, total) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTER.x + RING_R * Math.cos(angle),
    y: CENTER.y + RING_R * Math.sin(angle)
  };
}

export default function MeshGraph({ devices, flushResults, flushToken }) {
  const positioned = useMemo(
    () => devices.map((d, i) => ({ ...d, pos: ringPosition(i, devices.length) })),
    [devices]
  );

  const meshLines = [];
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      meshLines.push([positioned[i], positioned[j]]);
    }
  }

  const bridges = positioned.filter((d) => d.hasInternet);
  const resultsByBridge = useMemo(() => {
    const map = {};
    for (const r of flushResults || []) {
      (map[r.bridgeId] ||= []).push(r);
    }
    return map;
  }, [flushResults]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mesh-graph" role="img" aria-label="Mesh network topology">
      {/* faint full-mesh connectivity */}
      {meshLines.map(([a, b], i) => (
        <line
          key={i}
          x1={a.pos.x} y1={a.pos.y} x2={b.pos.x} y2={b.pos.y}
          stroke="var(--border)" strokeWidth="1"
        />
      ))}

      {/* uplinks: every bridge device has a dashed line to the backend */}
      {bridges.map((b) => (
        <line
          key={`uplink-${b.id}`}
          x1={b.pos.x} y1={b.pos.y} x2={BACKEND.x} y2={BACKEND.y}
          stroke="var(--link-line)" strokeWidth="1.5" strokeDasharray="4 4"
        />
      ))}

      {/* traveling packet pulses along uplinks, one burst per flush action */}
      {bridges.map((b) =>
        (resultsByBridge[b.id] || []).map((r, i) => (
          <circle key={`${flushToken}-${b.id}-${i}`} r="5" fill={OUTCOME_COLOR[r.outcome] || 'var(--signal)'}>
            <animateMotion
              dur="1.1s"
              begin={`${i * 0.15}s`}
              fill="freeze"
              path={`M${b.pos.x},${b.pos.y} L${BACKEND.x},${BACKEND.y}`}
            />
            <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" dur="1.1s" begin={`${i * 0.15}s`} fill="freeze" />
          </circle>
        ))
      )}

      {/* backend node */}
      <g transform={`translate(${BACKEND.x}, ${BACKEND.y})`}>
        <rect x="-46" y="-20" width="92" height="40" rx="8" fill="var(--surface-raised)" stroke="var(--settled)" strokeWidth="1.5" />
        <text textAnchor="middle" dy="5" className="mesh-node-label" fill="var(--settled)">BACKEND</text>
      </g>

      {/* device nodes */}
      {positioned.map((d) => {
        const holding = d.packetCount > 0;
        const minTtl = holding ? Math.min(...d.packets.map((p) => p.ttl)) : null;
        return (
          <g key={d.id} transform={`translate(${d.pos.x}, ${d.pos.y})`}>
            {d.hasInternet && (
              <circle r="34" fill="none" stroke="var(--link-line)" strokeWidth="1.5" strokeDasharray="3 4" />
            )}
            <circle
              r="26"
              fill="var(--surface-raised)"
              stroke={holding ? 'var(--signal)' : 'var(--border)'}
              strokeWidth={holding ? 2.5 : 1.5}
              className={holding ? 'mesh-node-active' : ''}
            />
            {holding && (
              <text textAnchor="middle" dy="4" className="mesh-node-ttl" fill="var(--signal)">
                {minTtl}
              </text>
            )}
            <text textAnchor="middle" y="46" className="mesh-node-label" fill="var(--text-muted)">
              {d.id}
            </text>
            {d.hasInternet && (
              <text textAnchor="middle" y="60" className="mesh-node-tag" fill="var(--link-line)">
                bridge
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
