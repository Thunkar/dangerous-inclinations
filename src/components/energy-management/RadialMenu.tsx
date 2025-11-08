import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Box, styled } from '@mui/material'

interface RadialMenuProps {
  children: ReactNode[]
  customToggle: ReactNode
  startAngle?: number
  rotationAngle?: number
  radius?: number
  onMenuToggled?: (isOpen: boolean) => void
  disabled?: boolean
  closeSignal?: number
}

const Wrapper = styled(Box)({
  display: 'flex',
  position: 'relative',
})

const Toggle = styled(Box)({
  display: 'flex',
  cursor: 'pointer',
})

const ChildrenContainer = styled(Box)({
  display: 'flex',
  position: 'fixed',
  zIndex: 100,
  pointerEvents: 'none',
})

interface RadialChildProps {
  isOpen: boolean
  angle: number
  radius: number
}

const RadialChild = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isOpen' && prop !== 'angle' && prop !== 'radius',
})<RadialChildProps>(({ isOpen, angle, radius }) => ({
  position: 'absolute',
  left: '0',
  top: '0',
  transition: 'all 0.3s ease-in-out',
  visibility: isOpen ? 'visible' : 'hidden',
  opacity: isOpen ? 1 : 0,
  pointerEvents: isOpen ? 'auto' : 'none',
  transform: `translate(
    calc(-50% + ${isOpen ? radius * Math.cos(angle) : 0}em),
    calc(-50% + ${isOpen ? radius * Math.sin(angle) : 0}em)
  )`,
}))

interface LineProps {
  isOpen: boolean
  angle: number
  radius: number
}

const Line = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isOpen' && prop !== 'angle' && prop !== 'radius',
})<LineProps>(({ isOpen, angle, radius, theme }) => {
  // Button radius is approximately 25px = 1.5em
  const buttonRadius = 1.5
  // Line should go from center to button edge
  const lineLength = radius - buttonRadius

  return {
    position: 'absolute',
    left: '-0.5px', // Half the line height to center it
    top: '-0.5px',
    transition: 'all 0.3s ease-in-out',
    visibility: isOpen ? 'visible' : 'hidden',
    opacity: isOpen ? 0.3 : 0,
    width: isOpen ? `${lineLength}em` : '0em',
    backgroundColor: theme.palette.divider,
    height: '1px',
    transformOrigin: 'left center',
    transform: `rotate(${angle}rad)`,
    pointerEvents: 'none',
  }
})

export function RadialMenu({
  children,
  customToggle,
  startAngle = -Math.PI / 4, // Default to -45 degrees
  rotationAngle = 2 * Math.PI, // Full circle
  radius = 8,
  onMenuToggled,
  disabled = false,
  closeSignal = 0,
}: RadialMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const toggleRef = useRef<HTMLDivElement>(null)

  const childrenArray = Array.isArray(children) ? children : [children]

  // Update position when menu opens
  useEffect(() => {
    if (isOpen && toggleRef.current) {
      const rect = toggleRef.current.getBoundingClientRect()
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
    }
  }, [isOpen])

  useEffect(() => {
    onMenuToggled?.(isOpen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Close menu when disabled from parent
  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false)
    }
  }, [disabled, isOpen])

  // Close menu when closeSignal changes (but only when it actually increments)
  useEffect(() => {
    if (closeSignal > 0) {
      setIsOpen(false)
    }
  }, [closeSignal])

  const angleCalculator = (index: number): number => {
    if (childrenArray.length === 1) {
      // Single button: place at center of rotation
      return startAngle + rotationAngle / 2
    }

    // Multiple buttons: distribute evenly across the rotation angle
    const increment = rotationAngle / (childrenArray.length - 1)
    return startAngle + index * increment
  }

  const handleToggle = () => {
    // Always toggle when clicked, even if disabled
    // This allows switching between menus
    setIsOpen(!isOpen)
  }

  return (
    <Wrapper>
      {/* Lines connecting to items */}
      <ChildrenContainer
        sx={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
      >
        {childrenArray.map((_, index) => (
          <Line
            key={`radial-line-${index}`}
            isOpen={isOpen}
            angle={angleCalculator(index)}
            radius={radius}
          />
        ))}
      </ChildrenContainer>

      {/* Toggle button */}
      <Toggle ref={toggleRef} onClick={handleToggle}>{customToggle}</Toggle>

      {/* Menu items */}
      <ChildrenContainer
        sx={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
      >
        {childrenArray.map((child, index) => (
          <RadialChild
            key={`radial-child-${index}`}
            isOpen={isOpen}
            angle={angleCalculator(index)}
            radius={radius}
          >
            {child}
          </RadialChild>
        ))}
      </ChildrenContainer>
    </Wrapper>
  )
}
