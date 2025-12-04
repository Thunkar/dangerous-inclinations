import { useState, useRef } from 'react'
import { Box } from '@mui/material'
import { useGame } from '../context/GameContext'
import type { Facing } from '../types/game'
import {
  BoardProvider,
  useBoardContext,
  BOARD_SIZE,
  ZOOM_CONFIG,
  SVGFilters,
  GameBoardControls,
  Minimap,
  GravityWell,
  TransferSectors,
  MissileRenderer,
  ShipRenderer,
  WeaponRangeIndicators,
  type MovementPreview,
} from './GameBoard/index'
import { GRAVITY_WELLS, TRANSFER_POINTS, getGravityWell } from '../constants/gravityWells'

interface GameBoardProps {
  pendingFacing?: Facing
  pendingMovement?: MovementPreview
}

export function GameBoard({ pendingFacing, pendingMovement }: GameBoardProps) {
  return (
    <BoardProvider>
      <GameBoardContent pendingFacing={pendingFacing} pendingMovement={pendingMovement} />
    </BoardProvider>
  )
}

function GameBoardContent({ pendingFacing, pendingMovement }: GameBoardProps) {
  const { gameState, weaponRangeVisibility, pendingState } = useGame()
  const { displayState } = useBoardContext()

  // Pan and zoom state - must be declared before any conditional returns (Rules of Hooks)
  // Start with 2x zoom for better initial view, centered on the black hole (board center)
  const [zoom, setZoom] = useState(2)
  // Pan is in SVG coordinates (offset from center)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // displayState contains rendered positions - don't render if not set yet
  if (!displayState) return null

  // Calculate viewBox based on zoom and pan
  // At zoom=1, we see the full board. At zoom=2, we see half the board, etc.
  const viewBoxSize = BOARD_SIZE / zoom
  const viewBoxX = (BOARD_SIZE - viewBoxSize) / 2 + pan.x
  const viewBoxY = (BOARD_SIZE - viewBoxSize) / 2 + pan.y

  // Handle wheel zoom - zooms relative to center of visible area
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? ZOOM_CONFIG.DELTA_MULTIPLIER_OUT : ZOOM_CONFIG.DELTA_MULTIPLIER_IN
    const newZoom = Math.max(ZOOM_CONFIG.MIN, Math.min(ZOOM_CONFIG.MAX, zoom * delta))
    setZoom(newZoom)
    // Pan stays the same in SVG coordinates - the viewBox calculation handles centering
  }

  // Handle mouse pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true)
      setPanStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      // Convert screen pixels to SVG coordinates
      // The viewBox shows viewBoxSize units, mapped to rect.width/height pixels
      const scaleX = viewBoxSize / rect.width
      const scaleY = viewBoxSize / rect.height
      const scale = Math.max(scaleX, scaleY) // Use the larger scale (due to preserveAspectRatio)

      const dx = (e.clientX - panStart.x) * scale
      const dy = (e.clientY - panStart.y) * scale

      setPan(prev => ({
        x: prev.x - dx,
        y: prev.y - dy,
      }))
      setPanStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const handleMouseLeave = () => {
    setIsPanning(false)
  }

  // Button zoom handlers
  const handleZoomIn = () => {
    const newZoom = Math.min(ZOOM_CONFIG.MAX, zoom * ZOOM_CONFIG.DELTA_MULTIPLIER_IN)
    setZoom(newZoom)
  }

  const handleZoomOut = () => {
    const newZoom = Math.max(ZOOM_CONFIG.MIN, zoom * ZOOM_CONFIG.DELTA_MULTIPLIER_OUT)
    setZoom(newZoom)
  }

  const handleResetView = () => {
    setZoom(2) // Reset to default 2x zoom
    setPan({ x: 0, y: 0 }) // Center on black hole
  }

  // Determine colors for gravity wells
  const getWellColor = (wellId: string) => {
    const well = getGravityWell(wellId)
    if (!well) return '#666'
    return well.type === 'blackhole' ? '#000' : well.color || '#666'
  }

  const getWellRadius = (wellId: string) => {
    const well = getGravityWell(wellId)
    if (!well) return 20
    return well.type === 'blackhole' ? 30 : 20
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        cursor: isPanning ? 'grabbing' : 'grab',
        userSelect: 'none',
        // Prevent any scrolling on the container
        '& *': {
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main SVG canvas */}
      <svg
        width="100%"
        height="100%"
        viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxSize} ${viewBoxSize}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          background: 'radial-gradient(circle, #0a0a1a 0%, #000000 100%)',
          display: 'block', // Prevent inline SVG from creating extra space
        }}
      >
        <g>
          {/* SVG Filters for ship/missile outlines */}
          <SVGFilters />

          {/* Transfer sector overlaps (Venn diagram) */}
          <TransferSectors transferPoints={TRANSFER_POINTS} />

          {/* Gravity wells with rings and sectors */}
          {GRAVITY_WELLS.map(well => (
            <GravityWell
              key={well.id}
              well={well}
              wellColor={getWellColor(well.id)}
              wellRadius={getWellRadius(well.id)}
              transferPoints={TRANSFER_POINTS}
            />
          ))}

          {/* Ships with movement predictions */}
          <ShipRenderer
            pendingFacing={pendingFacing}
            pendingMovement={pendingMovement}
            pendingState={pendingState}
          >
            {(playerId, index) => {
              /* Weapon range indicators rendered as children of each ship */
              const player = gameState.players.find(p => p.id === playerId)
              if (!player) return null
              return (
                <WeaponRangeIndicators
                  player={player}
                  playerIndex={index}
                  pendingFacing={pendingFacing}
                  pendingMovement={pendingMovement}
                  pendingState={pendingState}
                  weaponRangeVisibility={weaponRangeVisibility}
                />
              )
            }}
          </ShipRenderer>

          {/* Missiles in flight */}
          <MissileRenderer />
        </g>
      </svg>

      {/* Minimap */}
      <Minimap pendingFacing={pendingFacing} zoom={zoom} pan={pan} />

      {/* Control buttons */}
      <GameBoardControls
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
      />
    </Box>
  )
}
