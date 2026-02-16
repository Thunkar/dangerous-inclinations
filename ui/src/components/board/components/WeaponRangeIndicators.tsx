import type { Player, Facing, SubsystemType } from '@dangerous-inclinations/engine'
import type { MovementPreview } from '../types'
import { useBoardContext } from '../context'
import { useGame } from '../../../context/GameContext'
import {
  calculateFiringSolutions,
  getSubsystemConfig,
  calculatePostMovementPosition,
  getGravityWell,
  getSubsystemSide,
  getSideFiringDirection,
} from '@dangerous-inclinations/engine'
import { getRingRadius } from '@/constants/visualConfig'
import { getPlayerColor } from '@/utils/playerColors'

interface WeaponRangeIndicatorsProps {
  player: Player
  playerIndex: number
  pendingFacing?: Facing
  pendingMovement?: MovementPreview
  pendingState: {
    tacticalSequence: Array<{ type: string; sequence: number; [key: string]: any }>
  }
  weaponRangeVisibility: {
    laser: boolean
    railgun: boolean
    missiles: boolean
    ballistic_rack: boolean
  }
}

/**
 * Renders weapon range indicators and targeting reticles for the active player
 */
export function WeaponRangeIndicators({
  player,
  playerIndex,
  pendingFacing,
  pendingMovement,
  pendingState,
  weaponRangeVisibility,
}: WeaponRangeIndicatorsProps) {
  const { scaleFactor, getGravityWellPosition, getSectorRotationOffset } = useBoardContext()
  const { gameState } = useGame()

  const players = gameState.players
  const activePlayerIndex = gameState.activePlayerIndex

  const isActive = playerIndex === activePlayerIndex
  if (!isActive) return null

  // Get ship's current position info
  const well = getGravityWell(player.ship.wellId)
  if (!well) return null

  const ringConfig = well.rings.find(r => r.ring === player.ship.ring)
  if (!ringConfig) return null

  const wellPosition = getGravityWellPosition(player.ship.wellId)
  const radius = (getRingRadius(player.ship.wellId, ringConfig.ring) ?? 100) * scaleFactor
  const rotationOffset = getSectorRotationOffset(player.ship.wellId)
  const angle =
    ((player.ship.sector + 0.5) / ringConfig.sectors) * 2 * Math.PI - Math.PI / 2 + rotationOffset
  const x = wellPosition.x + radius * Math.cos(angle)
  const y = wellPosition.y + radius * Math.sin(angle)

  // Calculate if any weapon fires after movement to determine position for range visualization
  const hasWeaponAfterMove = pendingState.tacticalSequence.some(action => {
    const isWeapon =
      action.type === 'fire_laser' ||
      action.type === 'fire_railgun' ||
      action.type === 'fire_missiles' ||
      action.type === 'fire_ballistic_rack'
    const moveAction = pendingState.tacticalSequence.find(a => a.type === 'move')
    return isWeapon && moveAction && action.sequence > moveAction.sequence
  })

  // Determine if rotation happens before or after movement
  const rotateAction = pendingState.tacticalSequence.find(a => a.type === 'rotate')
  const moveAction = pendingState.tacticalSequence.find(a => a.type === 'move')
  const rotateBeforeMove =
    rotateAction && moveAction ? rotateAction.sequence < moveAction.sequence : true // Default to rotate before move

  // Calculate ship position for range visualization
  let rangeVisualizationShip = player.ship
  let rangeVisualizationRing = ringConfig
  let rangeVisualizationRadius = radius
  let rangeVisualizationAngle = angle
  let rangeVisualizationX = x
  let rangeVisualizationY = y

  if (hasWeaponAfterMove) {
    // Use post-movement position for visualization
    rangeVisualizationShip = calculatePostMovementPosition(
      player.ship,
      pendingFacing,
      pendingMovement,
      rotateBeforeMove
    )

    // Recalculate ring config and position for post-movement ship
    const postMoveWell = getGravityWell(rangeVisualizationShip.wellId)
    const postMoveRingConfig = postMoveWell?.rings.find(r => r.ring === rangeVisualizationShip.ring)
    if (postMoveRingConfig && postMoveWell) {
      rangeVisualizationRing = postMoveRingConfig
      const postMoveWellPosition = getGravityWellPosition(rangeVisualizationShip.wellId)
      rangeVisualizationRadius =
        (getRingRadius(rangeVisualizationShip.wellId, postMoveRingConfig.ring) ?? 100) * scaleFactor
      const postMoveRotationOffset = getSectorRotationOffset(rangeVisualizationShip.wellId)
      // Visual sector same as logical sector
      rangeVisualizationAngle =
        ((rangeVisualizationShip.sector + 0.5) / postMoveRingConfig.sectors) * 2 * Math.PI -
        Math.PI / 2 +
        postMoveRotationOffset
      rangeVisualizationX =
        postMoveWellPosition.x + rangeVisualizationRadius * Math.cos(rangeVisualizationAngle)
      rangeVisualizationY =
        postMoveWellPosition.y + rangeVisualizationRadius * Math.sin(rangeVisualizationAngle)
    }
  }

  return (
    <>
      {/* Render range visualization for each toggled weapon */}
      {(['laser', 'railgun', 'missiles', 'ballistic_rack'] as const).map(weaponKey => {
        // Only show if toggled on
        if (!weaponRangeVisibility[weaponKey]) return null

        const subsystemType: SubsystemType = weaponKey

        // Get ALL weapon subsystems of this type (ship may have multiple on different sides)
        const weaponSubsystems = rangeVisualizationShip.subsystems.filter(s => s.type === subsystemType)
        if (weaponSubsystems.length === 0) return null

        const weaponConfig = getSubsystemConfig(subsystemType)
        const weaponStats = weaponConfig.weaponStats
        if (!weaponStats) return null

        // For broadside weapons, draw filled polygon areas showing coverage
        if (weaponStats.arc === 'broadside') {
          const rangeWellPosition = getGravityWellPosition(rangeVisualizationShip.wellId)
          const rangeWell = getGravityWell(rangeVisualizationShip.wellId)
          if (!rangeWell) return null

          const sectorSize = (2 * Math.PI) / rangeVisualizationRing.sectors
          const rotOff = getSectorRotationOffset(rangeVisualizationShip.wellId)
          const shipRing = rangeVisualizationShip.ring
          const shipSector = rangeVisualizationShip.sector
          const sectors = rangeVisualizationRing.sectors
          const color = getPlayerColor(playerIndex)

          // Use pending facing if active player
          const effectiveFacing =
            playerIndex === activePlayerIndex && pendingFacing
              ? pendingFacing
              : rangeVisualizationShip.facing

          // Determine which ring directions are valid based on side-restriction
          let validDirections: Set<'inward' | 'outward'> = new Set(['inward', 'outward'])
          if (weaponStats.sideRestricted) {
            validDirections = new Set()
            for (const sub of weaponSubsystems) {
              const side = getSubsystemSide(sub)
              if (side) {
                validDirections.add(getSideFiringDirection(side, effectiveFacing))
              }
            }
          }

          // Helper: get the angle of a sector boundary (the edge between sector s-1 and sector s)
          const sectorBoundaryAngle = (sector: number) =>
            (sector / sectors) * 2 * Math.PI - Math.PI / 2 + rotOff

          // Helper: point on a ring at an angle
          const ringPoint = (ringNum: number, ang: number) => {
            const r = (getRingRadius(rangeVisualizationShip.wellId, ringNum) ?? 100) * scaleFactor
            return {
              x: rangeWellPosition.x + r * Math.cos(ang),
              y: rangeWellPosition.y + r * Math.sin(ang),
            }
          }

          // Helper: get scaled radius for a ring
          const ringRadius = (ringNum: number) =>
            (getRingRadius(rangeVisualizationShip.wellId, ringNum) ?? 100) * scaleFactor

          // Ship sector boundary angles
          // "back" = retrograde edge (lower sector boundary), "tip" = prograde edge (higher sector boundary)
          const backAngle = sectorBoundaryAngle(shipSector)
          const tipAngle = sectorBoundaryAngle(shipSector + 1)

          // Coverage sector boundaries: ship ± sectorRange
          const coverageBackSector = (shipSector - weaponStats.sectorRange + sectors) % sectors
          const coverageTipSector = (shipSector + weaponStats.sectorRange + 1) % sectors
          const coverageBackAngle = sectorBoundaryAngle(coverageBackSector)
          const coverageTipAngle = sectorBoundaryAngle(coverageTipSector)

          // Arc span for the coverage
          const arcSpan = weaponStats.sectorRange * 2 + 1
          const arcAngle = arcSpan * sectorSize

          // Build SVG path for a directional wedge (outward or inward)
          // Creates a staircase shape: starts at ship's own sector, steps out to ±sectorRange
          // coverage at the adjacent ring, then continues to the far ring.
          // Example (laser, ship R3S15, outward, sectorRange=1):
          //   R3S15 tip → R4S16 tip → R5S16 tip → arc R5 → R5S14 back → R4S14 back → R3S15 back → arc R3
          const buildWedgePath = (direction: 'outward' | 'inward') => {
            let farRing: number
            if (direction === 'outward') {
              farRing = Math.min(rangeWell.rings.length, shipRing + weaponStats.ringRange)
              if (farRing <= shipRing) return null
            } else {
              farRing = Math.max(1, shipRing - weaponStats.ringRange)
              if (farRing >= shipRing) return null
            }

            const adjacentRing = direction === 'outward' ? shipRing + 1 : shipRing - 1

            const shipTip = ringPoint(shipRing, tipAngle)
            const shipBack = ringPoint(shipRing, backAngle)
            const adjTip = ringPoint(adjacentRing, coverageTipAngle)
            const adjBack = ringPoint(adjacentRing, coverageBackAngle)
            const farTip = ringPoint(farRing, coverageTipAngle)
            const farBack = ringPoint(farRing, coverageBackAngle)

            const farR = ringRadius(farRing)
            const shipR = ringRadius(shipRing)

            // Build the path as a staircase polygon
            let d = `M ${shipTip.x} ${shipTip.y}`

            // Prograde side: step from ship sector tip to coverage tip at adjacent ring
            d += ` L ${adjTip.x} ${adjTip.y}`

            // If far ring is beyond the adjacent ring, continue straight to far ring
            if (farRing !== adjacentRing) {
              d += ` L ${farTip.x} ${farTip.y}`
            }

            // Arc along far ring from coverage tip to coverage back
            // tip→back is counter-clockwise (decreasing sector angle), sweep=0
            d += ` A ${farR} ${farR} 0 ${arcAngle > Math.PI ? 1 : 0} 0 ${farBack.x} ${farBack.y}`

            // Retrograde side: come back from far ring to adjacent ring, then step to ship sector
            if (farRing !== adjacentRing) {
              d += ` L ${adjBack.x} ${adjBack.y}`
            }

            // Step from coverage back at adjacent ring to ship sector back
            d += ` L ${shipBack.x} ${shipBack.y}`

            // Arc along ship ring from back to tip (clockwise, sweep=1)
            d += ` A ${shipR} ${shipR} 0 0 1 ${shipTip.x} ${shipTip.y}`
            d += ' Z'

            return d
          }

          // Build a single unified polygon for weapons that cover both directions + same ring
          // (e.g. ballistic rack: ±1 ring, ±1 sector, not side-restricted, canTargetSameRing)
          // Shape: simple annular wedge from innermost ring to outermost ring
          const buildUnifiedPath = () => {
            if (!weaponStats.canTargetSameRing || weaponStats.sideRestricted) return null

            const innerRing = Math.max(1, shipRing - weaponStats.ringRange)
            const outerRing = Math.min(rangeWell.rings.length, shipRing + weaponStats.ringRange)
            if (innerRing >= outerRing) return null

            const innerR = ringRadius(innerRing)
            const outerR = ringRadius(outerRing)

            const outerTip = ringPoint(outerRing, coverageTipAngle)
            const outerBack = ringPoint(outerRing, coverageBackAngle)
            const innerTip = ringPoint(innerRing, coverageTipAngle)
            const innerBack = ringPoint(innerRing, coverageBackAngle)

            // Outer arc: tip → back (counter-clockwise, sweep=0)
            // Inner arc: back → tip (clockwise, sweep=1) — but we're going from innerBack to innerTip
            // which is back→tip = counter-clockwise on inner ring... wait:
            // We traverse: outerTip → arc to outerBack → line to innerBack → arc to innerTip → line to outerTip
            // Inner arc from back to tip goes clockwise (increasing angle), sweep=1
            return `M ${outerTip.x} ${outerTip.y}` +
              ` A ${outerR} ${outerR} 0 ${arcAngle > Math.PI ? 1 : 0} 0 ${outerBack.x} ${outerBack.y}` +
              ` L ${innerBack.x} ${innerBack.y}` +
              ` A ${innerR} ${innerR} 0 ${arcAngle > Math.PI ? 1 : 0} 1 ${innerTip.x} ${innerTip.y}` +
              ` L ${outerTip.x} ${outerTip.y} Z`
          }

          const unifiedPath = buildUnifiedPath()

          // For unified weapons (ballistic rack), draw one shape; otherwise use separate wedges
          if (unifiedPath) {
            return (
              <g key={`weapon-visibility-${weaponKey}`}>
                <path d={unifiedPath} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5} opacity={0.7} />
              </g>
            )
          }

          const outwardPath = validDirections.has('outward') ? buildWedgePath('outward') : null
          const inwardPath = validDirections.has('inward') ? buildWedgePath('inward') : null

          return (
            <g key={`weapon-visibility-${weaponKey}`}>
              {outwardPath && (
                <path d={outwardPath} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5} opacity={0.7} />
              )}
              {inwardPath && (
                <path d={inwardPath} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={1.5} opacity={0.7} />
              )}
            </g>
          )
        }

        // For spinal weapons (railgun), show arc along same ring in facing direction
        if (weaponStats.arc === 'spinal') {
          // Spinal weapons fire tangentially along the current ring
          // Use fixed sectorRange from weapon stats
          const spinalRange = weaponStats.sectorRange

          // Calculate current position angle
          const sectorSize = (2 * Math.PI) / rangeVisualizationRing.sectors
          const currentAngle = rangeVisualizationAngle

          // Use pending facing if available
          const effectiveFacing =
            playerIndex === activePlayerIndex && pendingFacing
              ? pendingFacing
              : rangeVisualizationShip.facing

          // Calculate the arc in facing direction
          let arcStartAngle: number
          let arcEndAngle: number

          if (effectiveFacing === 'prograde') {
            // Fire forward (counter-clockwise on display)
            arcStartAngle = currentAngle
            arcEndAngle = currentAngle + spinalRange * sectorSize
          } else {
            // Fire backward (clockwise on display)
            arcStartAngle = currentAngle - spinalRange * sectorSize
            arcEndAngle = currentAngle
          }

          // Calculate arc endpoints
          const rangeWellPosition = getGravityWellPosition(rangeVisualizationShip.wellId)
          const arcStartX = rangeWellPosition.x + rangeVisualizationRadius * Math.cos(arcStartAngle)
          const arcStartY = rangeWellPosition.y + rangeVisualizationRadius * Math.sin(arcStartAngle)
          const arcEndX = rangeWellPosition.x + rangeVisualizationRadius * Math.cos(arcEndAngle)
          const arcEndY = rangeWellPosition.y + rangeVisualizationRadius * Math.sin(arcEndAngle)

          // Calculate if this is a large arc (> 180°)
          let arcAngle = arcEndAngle - arcStartAngle
          if (arcAngle < 0) arcAngle += 2 * Math.PI
          const largeArcFlag = arcAngle > Math.PI ? 1 : 0

          return (
            <g key={`weapon-spinal-${weaponKey}`}>
              {/* Draw arc showing firing range along orbit */}
              <path
                d={`
                  M ${arcStartX} ${arcStartY}
                  A ${rangeVisualizationRadius} ${rangeVisualizationRadius} 0 ${largeArcFlag} 1 ${arcEndX} ${arcEndY}
                `}
                fill="none"
                stroke={getPlayerColor(playerIndex)}
                strokeWidth={4}
                opacity={0.6}
              />
              {/* Mark ship position */}
              <circle
                cx={rangeVisualizationX}
                cy={rangeVisualizationY}
                r={6}
                fill={getPlayerColor(playerIndex)}
                opacity={0.9}
                stroke="#fff"
                strokeWidth={2}
              />
              {/* Mark arc endpoints */}
              <circle cx={arcStartX} cy={arcStartY} r={4} fill={getPlayerColor(playerIndex)} opacity={0.8} />
              <circle cx={arcEndX} cy={arcEndY} r={4} fill={getPlayerColor(playerIndex)} opacity={0.8} />
            </g>
          )
        }

        // For turret weapons (missiles), use same visualization as broadside (omnidirectional)
        if (weaponStats.arc === 'turret') {
          const rangeWellPosition = getGravityWellPosition(rangeVisualizationShip.wellId)

          // Calculate attacker's sector angular boundaries
          const sectorSize = (2 * Math.PI) / rangeVisualizationRing.sectors
          const sectorStartAngle = rangeVisualizationAngle - sectorSize / 2
          const sectorEndAngle = rangeVisualizationAngle + sectorSize / 2

          // Turret can fire in all directions
          const turretRangeWell = getGravityWell(rangeVisualizationShip.wellId)
          if (!turretRangeWell) return null

          const minRing = Math.max(1, rangeVisualizationShip.ring - weaponStats.ringRange)
          const maxRing = Math.min(
            turretRangeWell.rings.length,
            rangeVisualizationShip.ring + weaponStats.ringRange
          )

          // Calculate sector boundary points on the ship's ring
          const rayStartX =
            rangeWellPosition.x + rangeVisualizationRadius * Math.cos(sectorStartAngle)
          const rayStartY =
            rangeWellPosition.y + rangeVisualizationRadius * Math.sin(sectorStartAngle)
          const rayEndX = rangeWellPosition.x + rangeVisualizationRadius * Math.cos(sectorEndAngle)
          const rayEndY = rangeWellPosition.y + rangeVisualizationRadius * Math.sin(sectorEndAngle)

          return (
            <g key={`weapon-turret-${weaponKey}`}>
              {/* Draw rays from sector endpoints outward to target rings */}
              {turretRangeWell.rings
                .filter(
                  r =>
                    r.ring >= minRing && r.ring <= maxRing && r.ring !== rangeVisualizationShip.ring
                )
                .map(targetRing => {
                  const targetRadius =
                    (getRingRadius(rangeVisualizationShip.wellId, targetRing.ring) ?? 100) *
                    scaleFactor
                  const targetSectorSize = (2 * Math.PI) / targetRing.sectors

                  // Normalize angles
                  const normalizeAngle = (a: number) => {
                    let normalized = a % (2 * Math.PI)
                    if (normalized < 0) normalized += 2 * Math.PI
                    return normalized
                  }

                  // Calculate coverage using sectorRange
                  const sectorCoverageAngle = weaponStats.sectorRange * targetSectorSize
                  const centerAngle = normalizeAngle(rangeVisualizationAngle + Math.PI / 2)

                  // Expand coverage by ±sectorRange
                  const coverageStart = centerAngle - sectorCoverageAngle
                  const coverageEnd = centerAngle + sectorCoverageAngle

                  // Find sector boundaries
                  const firstSector = Math.floor(normalizeAngle(coverageStart) / targetSectorSize)
                  const epsilon = 1e-10
                  const endSectorRaw = normalizeAngle(coverageEnd) / targetSectorSize
                  const fractionalPart = endSectorRaw - Math.floor(endSectorRaw)
                  const lastSector =
                    fractionalPart < epsilon
                      ? Math.floor(endSectorRaw) - 1
                      : Math.floor(endSectorRaw)

                  const coverageStartAngle = firstSector * targetSectorSize - Math.PI / 2
                  const coverageEndAngle = (lastSector + 1) * targetSectorSize - Math.PI / 2

                  const targetStartX =
                    rangeWellPosition.x + targetRadius * Math.cos(coverageStartAngle)
                  const targetStartY =
                    rangeWellPosition.y + targetRadius * Math.sin(coverageStartAngle)
                  const targetEndX = rangeWellPosition.x + targetRadius * Math.cos(coverageEndAngle)
                  const targetEndY = rangeWellPosition.y + targetRadius * Math.sin(coverageEndAngle)

                  let arcAngle = coverageEndAngle - coverageStartAngle
                  if (arcAngle < 0) arcAngle += 2 * Math.PI

                  return (
                    <g key={`rays-${targetRing.ring}`}>
                      <line
                        x1={rayStartX}
                        y1={rayStartY}
                        x2={targetStartX}
                        y2={targetStartY}
                        stroke={getPlayerColor(playerIndex)}
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        opacity={0.5}
                      />
                      <line
                        x1={rayEndX}
                        y1={rayEndY}
                        x2={targetEndX}
                        y2={targetEndY}
                        stroke={getPlayerColor(playerIndex)}
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        opacity={0.5}
                      />
                      <path
                        d={`
                          M ${targetStartX} ${targetStartY}
                          A ${targetRadius} ${targetRadius} 0 ${arcAngle > Math.PI ? 1 : 0} 1 ${targetEndX} ${targetEndY}
                        `}
                        fill="none"
                        stroke={getPlayerColor(playerIndex)}
                        strokeWidth={3}
                        opacity={0.4}
                      />
                    </g>
                  )
                })}
              <circle cx={rayStartX} cy={rayStartY} r={4} fill={getPlayerColor(playerIndex)} opacity={0.8} />
              <circle cx={rayEndX} cy={rayEndY} r={4} fill={getPlayerColor(playerIndex)} opacity={0.8} />
            </g>
          )
        }

        return null
      })}

      {/* Show targeting indicators for all toggled weapons */}
      {(['laser', 'railgun', 'missiles', 'ballistic_rack'] as const).map(weaponKey => {
        // Only show if toggled on
        if (!weaponRangeVisibility[weaponKey]) return null

        const subsystemType: SubsystemType = weaponKey

        // Get ALL weapon subsystems of this type
        const weaponSubsystems = player.ship.subsystems.filter(s => s.type === subsystemType)
        if (weaponSubsystems.length === 0) return null

        const weaponConfig = getSubsystemConfig(subsystemType)
        if (!weaponConfig.weaponStats) return null

        // Determine if this weapon fires after movement in the tactical sequence
        let shipPositionForRangeCalc = player.ship

        if (isActive) {
          // Check if any weapon action of this type exists in tactical sequence
          const weaponActionType =
            weaponKey === 'laser'
              ? 'fire_laser'
              : weaponKey === 'railgun'
                ? 'fire_railgun'
                : weaponKey === 'ballistic_rack'
                  ? 'fire_ballistic_rack'
                  : 'fire_missiles'
          const weaponAction = pendingState.tacticalSequence.find(a => a.type === weaponActionType)
          const moveAction = pendingState.tacticalSequence.find(a => a.type === 'move')

          // If both weapon and move actions exist, check their sequence order
          if (weaponAction && moveAction && weaponAction.sequence > moveAction.sequence) {
            // Weapon fires after movement - calculate post-movement position
            shipPositionForRangeCalc = calculatePostMovementPosition(
              player.ship,
              pendingFacing,
              pendingMovement
            )
          }
        }

        // Calculate firing solutions using all subsystem instances, deduplicating targets
        const allSolutions = new Map<string, ReturnType<typeof calculateFiringSolutions>[number]>()
        for (const sub of weaponSubsystems) {
          const solutions = calculateFiringSolutions(
            sub,
            shipPositionForRangeCalc,
            players,
            player.id,
            playerIndex === activePlayerIndex ? pendingFacing : undefined
          )
          for (const sol of solutions) {
            // Keep the solution if target not yet seen or if this one is in range
            if (!allSolutions.has(sol.targetPlayer.id) || sol.inRange) {
              allSolutions.set(sol.targetPlayer.id, sol)
            }
          }
        }
        const firingSolutions = Array.from(allSolutions.values())

        return (
          <g key={`targeting-${weaponKey}`}>
            {firingSolutions.map(solution => {
              if (!solution.inRange) return null

              const otherPlayer = solution.targetPlayer
              const otherWell = getGravityWell(otherPlayer.ship.wellId)
              if (!otherWell) return null

              const otherRingConfig = otherWell.rings.find(r => r.ring === otherPlayer.ship.ring)
              if (!otherRingConfig) return null

              // Get the target's gravity well position
              const targetWellPosition = getGravityWellPosition(otherPlayer.ship.wellId)

              // Draw targeting reticle
              const otherRadius =
                (getRingRadius(otherPlayer.ship.wellId, otherRingConfig.ring) ?? 100) * scaleFactor
              const otherRotationOffset = getSectorRotationOffset(otherPlayer.ship.wellId)
              // Visual sector same as logical sector
              const otherAngle =
                ((otherPlayer.ship.sector + 0.5) / otherRingConfig.sectors) * 2 * Math.PI -
                Math.PI / 2 +
                otherRotationOffset
              const otherX = targetWellPosition.x + otherRadius * Math.cos(otherAngle)
              const otherY = targetWellPosition.y + otherRadius * Math.sin(otherAngle)

              return (
                <g key={`targeting-${otherPlayer.id}`}>
                  {/* Targeting reticle */}
                  <circle
                    cx={otherX}
                    cy={otherY}
                    r={16}
                    fill="none"
                    stroke={getPlayerColor(playerIndex)}
                    strokeWidth={2}
                    opacity={0.7}
                  />
                  <line
                    x1={otherX - 20}
                    y1={otherY}
                    x2={otherX - 10}
                    y2={otherY}
                    stroke={getPlayerColor(playerIndex)}
                    strokeWidth={2}
                    opacity={0.7}
                  />
                  <line
                    x1={otherX + 20}
                    y1={otherY}
                    x2={otherX + 10}
                    y2={otherY}
                    stroke={getPlayerColor(playerIndex)}
                    strokeWidth={2}
                    opacity={0.7}
                  />
                  <line
                    x1={otherX}
                    y1={otherY - 20}
                    x2={otherX}
                    y2={otherY - 10}
                    stroke={getPlayerColor(playerIndex)}
                    strokeWidth={2}
                    opacity={0.7}
                  />
                  <line
                    x1={otherX}
                    y1={otherY + 20}
                    x2={otherX}
                    y2={otherY + 10}
                    stroke={getPlayerColor(playerIndex)}
                    strokeWidth={2}
                    opacity={0.7}
                  />
                  {/* Range indicator text - show distance */}
                  <text
                    x={otherX}
                    y={otherY - 24}
                    textAnchor="middle"
                    fontSize={9}
                    fill={getPlayerColor(playerIndex)}
                    fontWeight="bold"
                  >
                    D{Math.round(solution.distance)}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
    </>
  )
}
