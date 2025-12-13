import { z } from 'zod'

// Action schemas that mirror the game engine's PlayerAction types
export const AllocateEnergyActionSchema = z.object({
  type: z.literal('ALLOCATE_ENERGY'),
  payload: z.object({
    subsystem: z.string(),
    amount: z.number().int().min(1).max(10),
  }),
})

export const DeallocateEnergyActionSchema = z.object({
  type: z.literal('DEALLOCATE_ENERGY'),
  payload: z.object({
    subsystem: z.string(),
    amount: z.number().int().min(1).max(10),
  }),
})

export const BurnActionSchema = z.object({
  type: z.literal('BURN'),
  payload: z.object({
    intensity: z.enum(['light', 'medium', 'heavy']),
    direction: z.enum(['prograde', 'retrograde']),
    sectorAdjustment: z.number().int().optional(),
  }),
})

export const CoastActionSchema = z.object({
  type: z.literal('COAST'),
  payload: z.object({
    activateScoop: z.boolean().optional(),
  }),
})

export const RotateActionSchema = z.object({
  type: z.literal('ROTATE'),
  payload: z.object({
    newFacing: z.enum(['prograde', 'retrograde']),
  }),
})

export const FireWeaponActionSchema = z.object({
  type: z.enum(['FIRE_LASER', 'FIRE_RAILGUN', 'FIRE_MISSILES']),
  payload: z.object({
    targetPlayerId: z.string(),
    sequence: z.number().int().min(1),
  }),
})

export const WellTransferActionSchema = z.object({
  type: z.literal('WELL_TRANSFER'),
  payload: z.object({
    destinationWellId: z.string(),
  }),
})

export const PlayerActionSchema = z.discriminatedUnion('type', [
  AllocateEnergyActionSchema,
  DeallocateEnergyActionSchema,
  BurnActionSchema,
  CoastActionSchema,
  RotateActionSchema,
  FireWeaponActionSchema,
  WellTransferActionSchema,
])

export const SubmitTurnSchema = z.object({
  gameId: z.string().uuid(),
  actions: z.array(PlayerActionSchema),
})

export type SubmitTurnInput = z.infer<typeof SubmitTurnSchema>
