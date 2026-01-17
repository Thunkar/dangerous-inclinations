import { useState, useRef, useCallback, useEffect } from 'react'
import { Box } from '@mui/material'
import { getGravityWell } from '@dangerous-inclinations/engine'
import type { GameState } from '@dangerous-inclinations/engine'
import { getRingRadius } from '@/constants/visualConfig'

interface DeploymentBoardProps {
  gameState: GameState
  availableSectors: number[]
  onSelectSector: (sector: number) => void
  enabled: boolean
}

const PLAYER_COLORS = [
  '#2196f3', // Blue
  '#f44336', // Red
  '#4caf50', // Green
  '#ff9800', // Orange
  '#9c27b0', // Purple
  '#00bcd4', // Cyan
]

/**
 * Simplified game board for deployment phase
 * Only renders the black hole with deployment ring and clickable sectors
 * Supports zoom and pan
 */
export function DeploymentBoard({
  gameState,
  availableSectors,
  onSelectSector,
  enabled,
}: DeploymentBoardProps) {
  const [hoveredSector, setHoveredSector] = useState<number | null>(null)
  // Start at zoom 1 (shows full board), same viewBox approach as main GameBoard
  const [zoom, setZoom] = useState(2)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Use same board size as main GameBoard (1850) for consistency
  const boardSize = 1850
  const centerX = boardSize / 2
  const centerY = boardSize / 2

  const blackhole = getGravityWell('blackhole')
  if (!blackhole) return null

  // Get Ring 4 config (deployment ring)
  const deploymentRing = blackhole.rings.find(r => r.ring === 4)
  if (!deploymentRing) return null

  // Scale factor matches main GameBoard calculation: (boardSize/2 - padding) / maxExtent
  const scaleFactor = (boardSize / 2 - 20) / 778
  const deploymentRadius = (getRingRadius('blackhole', deploymentRing.ring) ?? 305) * scaleFactor
  const innerRadius = deploymentRadius - 20
  const outerRadius = deploymentRadius + 10

  // Black hole rotation offset: 0 (matches main GameBoard behavior)
  const rotationOffset = 0

  // Calculate viewBox based on zoom and pan (same approach as main GameBoard)
  const viewBoxSize = boardSize / zoom
  const viewBoxX = (boardSize - viewBoxSize) / 2 + pan.x
  const viewBoxY = (boardSize - viewBoxSize) / 2 + pan.y

  // Zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 8))
  }, [])

  // Pan handlers - drag to pan like the main GameBoard
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      // Left click to pan
      setIsPanning(true)
      setPanStart({ x: e.clientX, y: e.clientY })
    }
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        // Convert screen pixels to SVG coordinates
        const scaleX = viewBoxSize / rect.width
        const scaleY = viewBoxSize / rect.height
        const scale = Math.max(scaleX, scaleY)

        const dx = (e.clientX - panStart.x) * scale
        const dy = (e.clientY - panStart.y) * scale

        setPan(prev => ({
          x: prev.x - dx,
          y: prev.y - dy,
        }))
        setPanStart({ x: e.clientX, y: e.clientY })
      }
    },
    [isPanning, panStart, viewBoxSize]
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Reset view on double-click
  const handleDoubleClick = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // Add global mouse up listener for pan
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsPanning(false)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  // Render deployed ships
  const deployedShips = gameState.players
    .filter(p => p.hasDeployed && p.ship.wellId === 'blackhole' && p.ship.ring === 4)
    .map(player => {
      const playerIndex = gameState.players.findIndex(p => p.id === player.id)
      const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length]
      const angle =
        ((player.ship.sector + 0.5) / deploymentRing.sectors) * 2 * Math.PI -
        Math.PI / 2 +
        rotationOffset
      const x = centerX + deploymentRadius * Math.cos(angle)
      const y = centerY + deploymentRadius * Math.sin(angle)

      return (
        <g key={player.id}>
          <circle cx={x} cy={y} r={12} fill={color} stroke="#fff" strokeWidth={2} />
          <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fill="#fff" fontWeight="bold">
            {player.name.charAt(0)}
          </text>
        </g>
      )
    })

  return (
    <Box
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      sx={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : 'grab',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxSize} ${viewBoxSize}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          background: 'radial-gradient(circle, #0a0a1a 0%, #000000 100%)',
          display: 'block',
        }}
      >
        {/* Background */}
        <rect width={boardSize} height={boardSize} fill="#0a0a0a" />

        {/* Black hole center */}
        <circle cx={centerX} cy={centerY} r={30} fill="#111" stroke="#333" strokeWidth={2} />
        <text x={centerX} y={centerY + 4} textAnchor="middle" fontSize={10} fill="#666">
          BH
        </text>

        {/* Ring outlines - skip Ring 4 since deployment sectors show it */}
        {blackhole.rings
          .filter(ring => ring.ring !== 4)
          .map(ring => (
            <circle
              key={ring.ring}
              cx={centerX}
              cy={centerY}
              r={(getRingRadius('blackhole', ring.ring) ?? 100) * scaleFactor}
              fill="none"
              stroke="#222"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}

        {/* Ring 4 label */}
        <text
          x={centerX + deploymentRadius + 20}
          y={centerY}
          textAnchor="start"
          fontSize={12}
          fill="#666"
        >
          Ring 4 (Deployment)
        </text>

        {/* Available deployment sectors */}
        {availableSectors.map(sector => {
          const isHovered = hoveredSector === sector

          // Calculate sector arc
          const sectorStartAngle =
            (sector / deploymentRing.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
          const sectorEndAngle =
            ((sector + 1) / deploymentRing.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset

          // Create arc path
          const startInnerX = centerX + innerRadius * Math.cos(sectorStartAngle)
          const startInnerY = centerY + innerRadius * Math.sin(sectorStartAngle)
          const endInnerX = centerX + innerRadius * Math.cos(sectorEndAngle)
          const endInnerY = centerY + innerRadius * Math.sin(sectorEndAngle)
          const startOuterX = centerX + outerRadius * Math.cos(sectorStartAngle)
          const startOuterY = centerY + outerRadius * Math.sin(sectorStartAngle)
          const endOuterX = centerX + outerRadius * Math.cos(sectorEndAngle)
          const endOuterY = centerY + outerRadius * Math.sin(sectorEndAngle)

          // Calculate center of sector for label
          const sectorCenterAngle = (sectorStartAngle + sectorEndAngle) / 2
          const labelRadius = deploymentRadius
          const labelX = centerX + labelRadius * Math.cos(sectorCenterAngle)
          const labelY = centerY + labelRadius * Math.sin(sectorCenterAngle)

          const arcPath = `
            M ${startInnerX} ${startInnerY}
            A ${innerRadius} ${innerRadius} 0 0 1 ${endInnerX} ${endInnerY}
            L ${endOuterX} ${endOuterY}
            A ${outerRadius} ${outerRadius} 0 0 0 ${startOuterX} ${startOuterY}
            Z
          `

          return (
            <g
              key={sector}
              style={{ cursor: enabled ? 'pointer' : 'default' }}
              onClick={() => enabled && onSelectSector(sector)}
              onMouseEnter={() => enabled && setHoveredSector(sector)}
              onMouseLeave={() => setHoveredSector(null)}
            >
              {/* Sector arc */}
              <path
                d={arcPath}
                fill={
                  isHovered
                    ? 'rgba(33, 150, 243, 0.6)'
                    : enabled
                      ? 'rgba(33, 150, 243, 0.3)'
                      : 'rgba(100, 100, 100, 0.2)'
                }
                stroke={isHovered ? '#2196f3' : enabled ? 'rgba(33, 150, 243, 0.6)' : '#444'}
                strokeWidth={isHovered ? 2 : 1}
              />
              {/* Sector label */}
              <text
                x={labelX}
                y={labelY + 3}
                textAnchor="middle"
                fontSize={isHovered ? 10 : 8}
                fill={isHovered ? '#fff' : enabled ? '#2196f3' : '#666'}
                fontWeight={isHovered ? 'bold' : 'normal'}
                style={{ pointerEvents: 'none' }}
              >
                {sector}
              </text>
            </g>
          )
        })}

        {/* Deployed ships */}
        {deployedShips}
      </svg>

      {/* Zoom controls hint */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          fontSize: 11,
          color: 'text.secondary',
          bgcolor: 'rgba(0,0,0,0.6)',
          px: 1,
          py: 0.5,
          borderRadius: 1,
        }}
      >
        Scroll to zoom • Drag to pan • Double-click to reset
      </Box>
    </Box>
  )
}
