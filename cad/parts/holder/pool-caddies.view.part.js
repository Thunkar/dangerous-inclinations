import { part } from 'fluidcad/core'
import { showPoolAndCaddies } from '../../pieces/holder.ts'

// Layout B filled: the pool tray and the six caddies in front of it; viewer only.
export const view = part('Holder B filled', () => showPoolAndCaddies())
