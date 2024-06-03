export class CircularQueue<T> {
  queue: (T | undefined)[];
  front: number;
  rear: number;
  size: number;
  capacity: number;
  constructor(initialCapacity = 4) {
    this.queue = new Array(initialCapacity);
    this.front = 0;
    this.rear = 0;
    this.size = 0;
    this.capacity = initialCapacity;
  }

  isFull() {
    return this.size === this.capacity;
  }

  isEmpty() {
    return this.size === 0;
  }

  enqueue(value: T) {
    if (this.isFull()) {
      this.resize();
    }
    this.queue[this.rear] = value;
    this.rear = (this.rear + 1) % this.capacity;
    this.size++;
  }

  dequeue() {
    if (this.isEmpty()) {
      throw new Error('Queue is empty');
    }
    const value = this.queue[this.front];
    this.queue[this.front] = undefined;
    this.front = (this.front + 1) % this.capacity;
    this.size--;
    return value!;
  }

  peek() {
    if (this.isEmpty()) {
      throw new Error('Queue is empty');
    }
    return this.queue[this.front]!;
  }

  resize() {
    const newCapacity = this.capacity * 2;
    const newQueue = new Array(newCapacity);

    for (let i = 0; i < this.size; i++) {
      newQueue[i] = this.queue[(this.front + i) % this.capacity];
    }

    this.queue = newQueue;
    this.front = 0;
    this.rear = this.size;
    this.capacity = newCapacity;
  }

  [Symbol.iterator]() {
    let count = 0;
    let currentIndex = this.front;
    const size = this.size;
    const queue = this.queue;
    const capacity = this.capacity;

    return {
      next() {
        if (count < size) {
          const value = queue[currentIndex];
          currentIndex = (currentIndex + 1) % capacity;
          count++;
          return { value, done: false };
        } else {
          return { done: true };
        }
      },
    };
  }
}
