import { Vector2, GameObject } from './types';

export let CANVAS_WIDTH = 960; // 20% larger from 800
export let CANVAS_HEIGHT = 720; // 20% larger from 600

export function setCanvasSize(width: number, height: number) {
  CANVAS_WIDTH = Math.max(320, Math.floor(width));
  CANVAS_HEIGHT = Math.max(240, Math.floor(height));
}

export function wrapPosition(position: Vector2): Vector2 {
  return {
    x: ((position.x % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH,
    y: ((position.y % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT,
  };
}

export function distance(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function checkCollision(a: GameObject, b: GameObject): boolean {
  return distance(a.position, b.position) < (a.radius + b.radius);
}

export function normalizeAngle(angle: number): number {
  return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

export function vectorFromAngle(angle: number, magnitude: number = 1): Vector2 {
  return {
    x: Math.cos(angle) * magnitude,
    y: Math.sin(angle) * magnitude,
  };
}

export function addVectors(a: Vector2, b: Vector2): Vector2 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

export function multiplyVector(vector: Vector2, scalar: number): Vector2 {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
  };
}

export function subtractVectors(a: Vector2, b: Vector2): Vector2 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

export function dotProduct(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

export function vectorMagnitude(vector: Vector2): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
}

export function normalizeVector(vector: Vector2): Vector2 {
  const magnitude = vectorMagnitude(vector);
  if (magnitude === 0) return { x: 0, y: 0 };
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
  };
}

export function calculateGravitationalForce(obj1: GameObject & { mass: number }, obj2: GameObject & { mass: number }, gravitationalConstant: number = 0.1): Vector2 {
  const distanceVector = subtractVectors(obj2.position, obj1.position);
  const distance = vectorMagnitude(distanceVector);
  
  // Avoid division by zero and extremely close objects
  if (distance < 10) return { x: 0, y: 0 };
  
  // F = G * (m1 * m2) / r^2
  const forceMagnitude = gravitationalConstant * (obj1.mass * obj2.mass) / (distance * distance);
  
  // Direction of force (normalized)
  const forceDirection = normalizeVector(distanceVector);
  
  // Return force vector
  return multiplyVector(forceDirection, forceMagnitude);
}

export function handleCollision(obj1: GameObject & { mass: number }, obj2: GameObject & { mass: number }): void {
  // Calculate collision normal (direction from obj1 to obj2)
  const collisionNormal = subtractVectors(obj2.position, obj1.position);
  const distance = vectorMagnitude(collisionNormal);
  
  if (distance === 0) return; // Avoid division by zero
  
  // Normalize the collision normal
  const normalizedNormal = normalizeVector(collisionNormal);
  
  // Calculate relative velocity
  const relativeVelocity = subtractVectors(obj1.velocity, obj2.velocity);
  
  // Calculate relative velocity along collision normal
  const velocityAlongNormal = dotProduct(relativeVelocity, normalizedNormal);
  
  // Don't resolve if velocities are separating
  if (velocityAlongNormal > 0) return;
  
  // Calculate restitution (bounciness) - making it somewhat bouncy
  const restitution = 0.6;
  
  // Calculate impulse scalar
  const impulseScalar = -(1 + restitution) * velocityAlongNormal / (1/obj1.mass + 1/obj2.mass);
  
  // Calculate impulse vector
  const impulse = multiplyVector(normalizedNormal, impulseScalar);
  
  // Apply impulse to velocities (Newton's third law)
  obj1.velocity = addVectors(obj1.velocity, multiplyVector(impulse, 1/obj1.mass));
  obj2.velocity = subtractVectors(obj2.velocity, multiplyVector(impulse, 1/obj2.mass));
  
  // Separate objects to prevent overlap
  const overlap = (obj1.radius + obj2.radius) - distance;
  if (overlap > 0) {
    const separationVector = multiplyVector(normalizedNormal, overlap * 0.5);
    obj1.position = subtractVectors(obj1.position, separationVector);
    obj2.position = addVectors(obj2.position, separationVector);
  }
}