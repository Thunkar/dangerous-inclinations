import { useState, useRef } from 'react'
import { Box } from '@mui/material'
import { useGame } from '../context/GameContext'
import type { Player, Facing } from '../types/game'
import {
  BoardProvider,
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

interface GameBoardProps {
  players: Player[]
  activePlayerIndex: number
  pendingFacing?: Facing
  pendingMovement?: MovementPreview
}

export function GameBoard({
  players,
  activePlayerIndex,
  pendingFacing,
  pendingMovement,
}: GameBoardProps) {
  return (
    <BoardProvider>
      <GameBoardContent
        players={players}
        activePlayerIndex={activePlayerIndex}
        pendingFacing={pendingFacing}
        pendingMovement={pendingMovement}
      />
    </BoardProvider>
  )
}

function GameBoardContent({
  players,
  activePlayerIndex,
  pendingFacing,
  pendingMovement,
}: GameBoardProps) {
  const { weaponRangeVisibility, pendingState, gameState } = useGame()

  // Pan and zoom state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta =
      e.deltaY > 0 ? ZOOM_CONFIG.DELTA_MULTIPLIER_OUT : ZOOM_CONFIG.DELTA_MULTIPLIER_IN
    const newZoom = Math.max(ZOOM_CONFIG.MIN, Math.min(ZOOM_CONFIG.MAX, zoom * delta))
    setZoom(newZoom)
  }

  // Handle mouse pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
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
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // Determine colors for gravity wells
  const getWellColor = (wellId: string) => {
    const well = gameState.gravityWells.find(w => w.id === wellId)
    if (!well) return '#666'
    return well.type === 'blackhole' ? '#000' : well.color || '#666'
  }

  const getWellRadius = (wellId: string) => {
    const well = gameState.gravityWells.find(w => w.id === wellId)
    if (!well) return 20
    return well.type === 'blackhole' ? 30 : 20
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        cursor: isPanning ? 'grabbing' : 'grab',
        userSelect: 'none',
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
        viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
        style={{
          background: 'radial-gradient(circle, #0a0a1a 0%, #000000 100%)',
        }}
      >
        <g transform={`scale(${zoom}) translate(${pan.x / zoom}, ${pan.y / zoom})`}>
          {/* SVG Filters for ship/missile outlines */}
          <SVGFilters players={players} />

          {/* Transfer sector overlaps (Venn diagram) */}
          <TransferSectors transferPoints={gameState.transferPoints} />

          {/* Gravity wells with rings and sectors */}
          {gameState.gravityWells.map(well => (
            <GravityWell
              key={well.id}
              well={well}
              wellColor={getWellColor(well.id)}
              wellRadius={getWellRadius(well.id)}
              transferPoints={gameState.transferPoints}
            />
          ))}

          {/* Ships with movement predictions */}
          <ShipRenderer
            players={players}
            activePlayerIndex={activePlayerIndex}
            gameState={gameState}
            pendingFacing={pendingFacing}
            pendingMovement={pendingMovement}
            pendingState={pendingState}
          >
            {(player, index) => (
              /* Weapon range indicators rendered as children of each ship */
              <WeaponRangeIndicators
                player={player}
                playerIndex={index}
                activePlayerIndex={activePlayerIndex}
                gameState={gameState}
                players={players}
                pendingFacing={pendingFacing}
                pendingMovement={pendingMovement}
                pendingState={pendingState}
                weaponRangeVisibility={weaponRangeVisibility}
              />
            )}
          </ShipRenderer>

          {/* Missiles in flight */}
          <MissileRenderer
            missiles={gameState.missiles}
            players={players}
            gameState={gameState}
          />
        </g>
      </svg>

      {/* Minimap */}
      <Minimap
        players={players}
        activePlayerIndex={activePlayerIndex}
        pendingFacing={pendingFacing}
        zoom={zoom}
        pan={pan}
      />

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
