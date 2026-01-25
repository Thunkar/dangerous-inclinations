/**
 * Generic min-heap priority queue implementation
 * Used for Dijkstra's algorithm in the movement planner
 */
export class PriorityQueue<T> {
  private heap: T[] = []
  private compareFn: (a: T, b: T) => number

  /**
   * Create a new priority queue
   * @param compareFn Comparison function - returns negative if a < b, positive if a > b, 0 if equal
   */
  constructor(compareFn: (a: T, b: T) => number) {
    this.compareFn = compareFn
  }

  /**
   * Add an item to the queue
   */
  enqueue(item: T): void {
    this.heap.push(item)
    this.bubbleUp(this.heap.length - 1)
  }

  /**
   * Remove and return the minimum item
   */
  dequeue(): T | undefined {
    if (this.heap.length === 0) return undefined

    const min = this.heap[0]
    const last = this.heap.pop()

    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last
      this.bubbleDown(0)
    }

    return min
  }

  /**
   * Peek at the minimum item without removing it
   */
  peek(): T | undefined {
    return this.heap[0]
  }

  /**
   * Check if the queue is empty
   */
  isEmpty(): boolean {
    return this.heap.length === 0
  }

  /**
   * Get the number of items in the queue
   */
  size(): number {
    return this.heap.length
  }

  /**
   * Clear all items from the queue
   */
  clear(): void {
    this.heap = []
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      if (this.compareFn(this.heap[index], this.heap[parentIndex]) >= 0) {
        break
      }
      this.swap(index, parentIndex)
      index = parentIndex
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length

    while (true) {
      const leftChild = 2 * index + 1
      const rightChild = 2 * index + 2
      let smallest = index

      if (
        leftChild < length &&
        this.compareFn(this.heap[leftChild], this.heap[smallest]) < 0
      ) {
        smallest = leftChild
      }

      if (
        rightChild < length &&
        this.compareFn(this.heap[rightChild], this.heap[smallest]) < 0
      ) {
        smallest = rightChild
      }

      if (smallest === index) break

      this.swap(index, smallest)
      index = smallest
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i]
    this.heap[i] = this.heap[j]
    this.heap[j] = temp
  }
}
