const DIRECTIONS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

const CORNERS = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
]

const SHADE = [0.78, 0.78, 0.5, 1.0, 0.9, 0.72]
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0]]
const HEAD_EDGES = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
const HEAD_CORNERS = [
  [-0.25, -0.5, -0.25],
  [-0.25, -0.5, 0.25],
  [-0.25, 0, -0.25],
  [-0.25, 0, 0.25],
  [0.25, -0.5, -0.25],
  [0.25, -0.5, 0.25],
  [0.25, 0, -0.25],
  [0.25, 0, 0.25],
]

const state = {
  resolution: 16,
  palette: [],
  cells: new Map(),
  tool: 'paint',
  color: '#2b2b2b',
  mirror: false,
  grid: true,
  sliceEnabled: false,
  slice: -9,
  undo: [],
  redo: [],
  yaw: 0.7,
  pitch: 0.35,
  distance: 2,
  center: [0, -0.6, 0],
  dragTool: false,
  dragCamera: false,
  lastCell: '',
  lastX: 0,
  lastY: 0,
}

const canvas = document.getElementById('view')
const status = document.getElementById('status')
const count = document.getElementById('count')
const resolutionLabel = document.getElementById('resolution')
const paletteList = document.getElementById('palette')
const colorInput = document.getElementById('color')
const clearButton = document.getElementById('clear')
const resolutionSelect = document.getElementById('resolution-select')
const distanceInput = document.getElementById('distance')
const distanceValue = document.getElementById('distance-value')

const RESOLUTIONS = [4, 8, 16, 32, 64]

for (const value of RESOLUTIONS) {
  const option = document.createElement('option')
  option.value = String(value)
  option.textContent = String(value)
  resolutionSelect.appendChild(option)
}
resolutionSelect.value = String(state.resolution)

let gl = null
let program = null
let positionLocation = 0
let colorLocation = 0
let mvpLocation = null
let faceBuffer = null
let colorBuffer = null
let lineBuffer = null
let faceCount = 0
let lineCount = 0

function key(x, y, z) {
  return x + ',' + y + ',' + z
}

function parseModel(text) {
  const root = JSON.parse(text)
  state.resolution = root.resolution
  state.palette = root.palette.slice()
  state.cells = new Map()
  for (const voxel of root.voxels) {
    state.cells.set(key(voxel[0], voxel[1], voxel[2]), voxel[3])
  }
}

function modelJson() {
  const voxels = []
  for (const [location, index] of state.cells) {
    const parts = location.split(',').map(Number)
    voxels.push([parts[0], parts[1], parts[2], index])
  }
  voxels.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
  return { kind: 'voxels', resolution: state.resolution, palette: state.palette.slice(), voxels }
}

function rgb(hex) {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function colorOf(index) {
  return rgb(state.palette[index] || '#ffffff')
}

function indexOfColor(hex) {
  const normalized = hex.toLowerCase()
  const existing = state.palette.findIndex((entry) => entry.toLowerCase() === normalized)
  if (existing >= 0) {
    return existing
  }
  state.palette.push(normalized)
  return state.palette.length - 1
}

function has(x, y, z) {
  return state.cells.has(key(x, y, z))
}

function bounds() {
  let min = [Infinity, Infinity, Infinity]
  let max = [-Infinity, -Infinity, -Infinity]
  for (const location of state.cells.keys()) {
    const parts = location.split(',').map(Number)
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], parts[axis])
      max[axis] = Math.max(max[axis], parts[axis] + 1)
    }
  }
  if (min[0] === Infinity) {
    const half = state.resolution / 4
    const top = -state.resolution / 2
    return { min: [-half - 1, top - 1, -half - 1], max: [half + 1, 1, half + 1] }
  }
  return { min, max }
}

function pushHeadGrid(lines, unit) {
  const resolution = state.resolution
  const half = resolution / 4
  const top = -resolution / 2
  const bottom = 0
  const push = (first, second) => lines.push(
    first[0] * unit, first[1] * unit, first[2] * unit,
    second[0] * unit, second[1] * unit, second[2] * unit,
  )
  // Top face grid.
  for (let index = -half; index <= half; index += 1) {
    push([index, top, -half], [index, top, half])
    push([-half, top, index], [half, top, index])
  }
  // Vertical lines on the four sides, skipping the bottom face.
  for (let index = -half; index <= half; index += 1) {
    push([index, top, -half], [index, bottom, -half])
    push([index, top, half], [index, bottom, half])
    push([-half, top, index], [-half, bottom, index])
    push([half, top, index], [half, bottom, index])
  }
  // Horizontal rings around the head.
  for (let height = top; height <= bottom; height += 1) {
    push([-half, height, -half], [half, height, -half])
    push([-half, height, half], [half, height, half])
    push([-half, height, -half], [-half, height, half])
    push([half, height, -half], [half, height, half])
  }
}

function buildMesh() {
  const unit = 1 / state.resolution
  const positions = []
  const colors = []
  const lines = []
  for (const [location, index] of state.cells) {
    const parts = location.split(',').map(Number)
    const [x, y, z] = parts
    if (state.sliceEnabled && y !== state.slice) {
      continue
    }
    const color = colorOf(index)
    for (let direction = 0; direction < DIRECTIONS.length; direction++) {
      const offset = DIRECTIONS[direction]
      if (has(x + offset[0], y + offset[1], z + offset[2])) {
        continue
      }
      const shade = SHADE[direction]
      const red = (color[0] / 255) * shade
      const green = (color[1] / 255) * shade
      const blue = (color[2] / 255) * shade
      const corners = CORNERS[direction].map((corner) => [
        (x + corner[0]) * unit,
        (y + corner[1]) * unit,
        (z + corner[2]) * unit,
      ])
      for (const triangle of [[0, 1, 2], [0, 2, 3]]) {
        for (const indexInTriangle of triangle) {
          positions.push(...corners[indexInTriangle])
          colors.push(red, green, blue)
        }
      }
      for (const edge of EDGES) {
        lines.push(...corners[edge[0]], ...corners[edge[1]])
      }
    }
  }
  for (const [first, second] of HEAD_EDGES) {
    lines.push(...HEAD_CORNERS[first], ...HEAD_CORNERS[second])
  }
  pushHeadGrid(lines, unit)
  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    lines: new Float32Array(lines),
  }
}

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aColor;
uniform mat4 uMvp;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = uMvp * vec4(aPosition, 1.0);
}`

const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}`

function createShader(type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return shader
}

function initGl() {
  gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true })
  if (!gl) {
    status.textContent = 'WebGL is not available'
    return false
  }
  program = gl.createProgram()
  gl.attachShader(program, createShader(gl.VERTEX_SHADER, VERTEX_SHADER))
  gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
  gl.linkProgram(program)
  positionLocation = gl.getAttribLocation(program, 'aPosition')
  colorLocation = gl.getAttribLocation(program, 'aColor')
  mvpLocation = gl.getUniformLocation(program, 'uMvp')
  faceBuffer = gl.createBuffer()
  colorBuffer = gl.createBuffer()
  lineBuffer = gl.createBuffer()
  gl.enable(gl.DEPTH_TEST)
  gl.clearColor(0.075, 0.086, 0.094, 1)
  return true
}

function upload() {
  const mesh = buildMesh()
  gl.bindBuffer(gl.ARRAY_BUFFER, faceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.DYNAMIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, mesh.lines, gl.DYNAMIC_DRAW)
  faceCount = mesh.positions.length / 3
  lineCount = mesh.lines.length / 3
  count.textContent = state.cells.size + ' voxels, ' + faceCount / 6 + ' faces'
  resolutionLabel.textContent = 'Resolution ' + state.resolution
  resolutionSelect.value = String(state.resolution)
}

function resetCamera() {
  const area = bounds()
  const unit = 1 / state.resolution
  state.center = [
    (area.min[0] + area.max[0]) * unit * 0.5,
    (area.min[1] + area.max[1]) * unit * 0.5,
    (area.min[2] + area.max[2]) * unit * 0.5,
  ]
  const radius = Math.max(
    (area.max[0] - area.min[0]) * unit,
    (area.max[1] - area.min[1]) * unit,
    (area.max[2] - area.min[2]) * unit,
  )
  state.distance = Math.max(1.2, radius * 2.2)
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function cameraBasis() {
  const eye = [
    state.center[0] + Math.sin(state.yaw) * Math.cos(state.pitch) * state.distance,
    state.center[1] - Math.sin(state.pitch) * state.distance,
    state.center[2] + Math.cos(state.yaw) * Math.cos(state.pitch) * state.distance,
  ]
  const forward = normalize([
    state.center[0] - eye[0],
    state.center[1] - eye[1],
    state.center[2] - eye[2],
  ])
  const right = normalize(cross(forward, [0, -1, 0]))
  const up = cross(right, forward)
  return { eye, forward, right, up }
}

function perspective(aspect) {
  const f = 1 / Math.tan((45 * Math.PI) / 180 / 2)
  const near = 0.01
  const far = 2000
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) / (near - far), -1,
    0, 0, (2 * near * far) / (near - far), 0,
  ])
}

function lookAt(eye, target, up) {
  const forward = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]])
  const right = normalize(cross(forward, up))
  const corrected = cross(right, forward)
  return new Float32Array([
    right[0], corrected[0], -forward[0], 0,
    right[1], corrected[1], -forward[1], 0,
    right[2], corrected[2], -forward[2], 0,
    -(right[0] * eye[0] + right[1] * eye[1] + right[2] * eye[2]),
    -(corrected[0] * eye[0] + corrected[1] * eye[1] + corrected[2] * eye[2]),
    forward[0] * eye[0] + forward[1] * eye[1] + forward[2] * eye[2],
    1,
  ])
}

function multiply(a, b) {
  const out = new Float32Array(16)
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let value = 0
      for (let index = 0; index < 4; index++) {
        value += a[index * 4 + row] * b[column * 4 + index]
      }
      out[column * 4 + row] = value
    }
  }
  return out
}

function draw() {
  if (!gl) {
    return
  }
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  gl.viewport(0, 0, width, height)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(program)
  const { eye } = cameraBasis()
  const mvp = multiply(perspective(width / height), lookAt(eye, state.center, [0, -1, 0]))
  gl.uniformMatrix4fv(mvpLocation, false, mvp)
  gl.enableVertexAttribArray(positionLocation)
  gl.enableVertexAttribArray(colorLocation)
  gl.enable(gl.POLYGON_OFFSET_FILL)
  gl.polygonOffset(1, 1)
  gl.bindBuffer(gl.ARRAY_BUFFER, faceBuffer)
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0)
  gl.drawArrays(gl.TRIANGLES, 0, faceCount)
  gl.disable(gl.POLYGON_OFFSET_FILL)
  if (state.grid && lineCount > 0) {
    gl.disableVertexAttribArray(colorLocation)
    gl.vertexAttrib3f(colorLocation, 0.35, 0.39, 0.43)
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer)
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.LINES, 0, lineCount)
    gl.enableVertexAttribArray(colorLocation)
  }
}

function ray(clientX, clientY) {
  const rect = canvas.getBoundingClientRect()
  const ndcX = (2 * (clientX - rect.left)) / rect.width - 1
  const ndcY = 1 - (2 * (clientY - rect.top)) / rect.height
  const { eye, forward, right, up } = cameraBasis()
  const halfHeight = Math.tan((45 * Math.PI) / 180 / 2)
  const halfWidth = halfHeight * (rect.width / rect.height)
  return {
    origin: eye,
    direction: normalize([
      forward[0] + right[0] * ndcX * halfWidth + up[0] * ndcY * halfHeight,
      forward[1] + right[1] * ndcX * halfWidth + up[1] * ndcY * halfHeight,
      forward[2] + right[2] * ndcX * halfWidth + up[2] * ndcY * halfHeight,
    ]),
  }
}

function pick(event) {
  const { origin: rawOrigin, direction } = ray(event.clientX, event.clientY)
  const resolution = state.resolution
  const origin = [rawOrigin[0] * resolution, rawOrigin[1] * resolution, rawOrigin[2] * resolution]
  const area = bounds()
  let enter = -Infinity
  let exit = Infinity
  let enterAxis = -1
  const axes = [
    [origin[0], direction[0], area.min[0], area.max[0]],
    [origin[1], direction[1], area.min[1], area.max[1]],
    [origin[2], direction[2], area.min[2], area.max[2]],
  ]
  for (let index = 0; index < axes.length; index++) {
    const [position, delta, low, high] = axes[index]
    if (Math.abs(delta) < 1e-6) {
      if (position < low || position > high) {
        return headSurfacePick(origin, direction)
      }
      continue
    }
    const first = (low - position) / delta
    const second = (high - position) / delta
    const near = Math.min(first, second)
    if (near > enter) {
      enter = near
      enterAxis = index
    }
    exit = Math.min(exit, Math.max(first, second))
  }
  if (exit < Math.max(enter, 0)) {
    return headSurfacePick(origin, direction)
  }
  let distance = Math.max(enter, 0) + 1e-4
  let x = Math.floor(origin[0] + direction[0] * distance)
  let y = Math.floor(origin[1] + direction[1] * distance)
  let z = Math.floor(origin[2] + direction[2] * distance)
  const stepX = direction[0] > 0 ? 1 : direction[0] < 0 ? -1 : 0
  const stepY = direction[1] > 0 ? 1 : direction[1] < 0 ? -1 : 0
  const stepZ = direction[2] > 0 ? 1 : direction[2] < 0 ? -1 : 0
  const deltaX = stepX === 0 ? Infinity : Math.abs(1 / direction[0])
  const deltaY = stepY === 0 ? Infinity : Math.abs(1 / direction[1])
  const deltaZ = stepZ === 0 ? Infinity : Math.abs(1 / direction[2])
  let maxX = stepX === 0 ? Infinity : ((stepX > 0 ? x + 1 : x) - (origin[0] + direction[0] * distance)) / direction[0]
  let maxY = stepY === 0 ? Infinity : ((stepY > 0 ? y + 1 : y) - (origin[1] + direction[1] * distance)) / direction[1]
  let maxZ = stepZ === 0 ? Infinity : ((stepZ > 0 ? z + 1 : z) - (origin[2] + direction[2] * distance)) / direction[2]
  let normal = [0, 0, 0]
  if (enterAxis >= 0 && enter > 0) {
    // The first cell can already be filled: the bounding box face we crossed is
    // the face of that voxel, so "add" knows which way to grow.
    normal[enterAxis] = direction[enterAxis] > 0 ? -1 : 1
  }
  for (let step = 0; step < 4096; step++) {
    if (has(x, y, z)) {
      return { x, y, z, normal, placeholder: false }
    }
    if (maxX < maxY && maxX < maxZ) {
      x += stepX
      distance = maxX
      maxX += deltaX
      normal = [-stepX, 0, 0]
    } else if (maxY < maxZ) {
      y += stepY
      distance = maxY
      maxY += deltaY
      normal = [0, -stepY, 0]
    } else {
      z += stepZ
      distance = maxZ
      maxZ += deltaZ
      normal = [0, 0, -stepZ]
    }
    if (distance > exit) {
      break
    }
  }
  return headSurfacePick(origin, direction)
}

function headSurfacePick(origin, direction) {
  const resolution = state.resolution
  const half = resolution / 4
  const top = -resolution / 2
  const bottom = 0
  const axes = [
    [origin[0], direction[0], -half, half],
    [origin[1], direction[1], top, bottom],
    [origin[2], direction[2], -half, half],
  ]
  let enter = -Infinity
  let exit = Infinity
  let axis = -1
  for (let index = 0; index < axes.length; index++) {
    const [position, delta, low, high] = axes[index]
    if (Math.abs(delta) < 1e-6) {
      if (position < low || position > high) {
        return null
      }
      continue
    }
    const first = (low - position) / delta
    const second = (high - position) / delta
    const near = Math.min(first, second)
    if (near > enter) {
      enter = near
      axis = index
    }
    exit = Math.min(exit, Math.max(first, second))
  }
  if (axis < 0 || enter <= 0 || exit < enter) {
    return null
  }
  const normal = [0, 0, 0]
  normal[axis] = direction[axis] > 0 ? -1 : 1
  if (axis === 1 && normal[1] > 0) {
    // The bottom of the head stays untouched.
    return null
  }
  const distance = enter + 1e-3
  const point = [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance,
  ]
  let x = Math.floor(point[0] + normal[0] * 0.5)
  let y = Math.floor(point[1] + normal[1] * 0.5)
  let z = Math.floor(point[2] + normal[2] * 0.5)
  if (axis !== 1) {
    y = Math.min(-1, Math.max(Math.floor(top), y))
  }
  return { x, y, z, normal, placeholder: true }
}

function insideHead(x, y, z) {
  const resolution = state.resolution
  const half = resolution / 4
  return x >= -half && x + 1 <= half
    && z >= -half && z + 1 <= half
    && y >= -resolution / 2 && y + 1 <= 0
}

function paint(x, y, z, index) {
  if (!insideHead(x, y, z)) {
    state.cells.set(key(x, y, z), index)
  }
  if (state.mirror && !insideHead(-x - 1, y, z)) {
    state.cells.set(key(-x - 1, y, z), index)
  }
}

function erase(x, y, z) {
  state.cells.delete(key(x, y, z))
  if (state.mirror) {
    state.cells.delete(key(-x - 1, y, z))
  }
}

function apply(hit) {
  if (hit.placeholder) {
    if (state.tool === 'erase' || state.tool === 'pick') {
      return
    }
    paint(hit.x, hit.y, hit.z, indexOfColor(state.color))
    return
  }
  if (state.tool === 'pick') {
    const index = state.cells.get(key(hit.x, hit.y, hit.z))
    if (index !== undefined) {
      state.color = state.palette[index]
      colorInput.value = state.color
    }
    return
  }
  const index = indexOfColor(state.color)
  if (state.tool === 'paint') {
    paint(hit.x, hit.y, hit.z, index)
  } else if (state.tool === 'erase') {
    erase(hit.x, hit.y, hit.z)
  } else if (state.tool === 'add') {
    const x = hit.x + hit.normal[0]
    const y = hit.y + hit.normal[1]
    const z = hit.z + hit.normal[2]
    if (!has(x, y, z)) {
      paint(x, y, z, index)
    }
  }
}

function snapshot() {
  return { resolution: state.resolution, cells: new Map(state.cells) }
}

function restore(snapshot) {
  state.cells = snapshot.cells
  state.resolution = snapshot.resolution
  updateHistory()
  upload()
  draw()
}

function pushUndo() {
  if (state.undo.length >= 40) {
    state.undo.shift()
  }
  state.undo.push(snapshot())
  state.redo.length = 0
  updateHistory()
}

function updateHistory() {
  document.getElementById('undo').disabled = state.undo.length === 0
  document.getElementById('redo').disabled = state.redo.length === 0
}

function undo() {
  const previous = state.undo.pop()
  if (!previous) {
    return
  }
  state.redo.push(snapshot())
  restore(previous)
}

function redo() {
  const next = state.redo.pop()
  if (!next) {
    return
  }
  state.undo.push(snapshot())
  restore(next)
}

canvas.addEventListener('pointerdown', (event) => {
  disarmClear()
  canvas.setPointerCapture(event.pointerId)
  if (event.button !== 0) {
    state.dragCamera = true
    state.lastX = event.clientX
    state.lastY = event.clientY
    return
  }
  if (event.altKey) {
    const hit = pick(event)
    if (hit) {
      apply({ ...hit, normal: hit.normal })
    }
    return
  }
  const hit = pick(event)
  if (!hit) {
    return
  }
  pushUndo()
  state.dragTool = true
  state.lastCell = key(hit.x, hit.y, hit.z)
  apply(hit)
  upload()
  draw()
})

canvas.addEventListener('pointermove', (event) => {
  if (state.dragCamera) {
    state.yaw += (event.clientX - state.lastX) * 0.01
    state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch + (event.clientY - state.lastY) * 0.01))
    state.lastX = event.clientX
    state.lastY = event.clientY
    draw()
    return
  }
  if (!state.dragTool) {
    return
  }
  const hit = pick(event)
  if (!hit) {
    return
  }
  const cell = key(hit.x, hit.y, hit.z)
  if (cell === state.lastCell) {
    return
  }
  state.lastCell = cell
  apply(hit)
  upload()
  draw()
})

canvas.addEventListener('pointerup', () => {
  state.dragTool = false
  state.dragCamera = false
  state.lastCell = ''
})

canvas.addEventListener('pointercancel', () => {
  state.dragTool = false
  state.dragCamera = false
})

canvas.addEventListener('contextmenu', (event) => event.preventDefault())

canvas.addEventListener('wheel', (event) => {
  event.preventDefault()
  state.distance = Math.max(0.2, Math.min(400, state.distance * (event.deltaY > 0 ? 1.1 : 1 / 1.1)))
  draw()
})

function setTool(tool) {
  disarmClear()
  state.tool = tool
  for (const button of document.querySelectorAll('[data-tool]')) {
    button.classList.toggle('active', button.dataset.tool === tool)
  }
}

for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => setTool(button.dataset.tool))
}

colorInput.addEventListener('input', () => {
  state.color = colorInput.value
})

for (const swatch of ['#2b2b2b', '#df5b73', '#1f1f1f', '#ffffff', '#9a9a9a', '#7fc8a9']) {
  const button = document.createElement('button')
  button.style.background = swatch
  button.title = swatch
  button.addEventListener('click', () => {
    state.color = swatch
    colorInput.value = swatch
  })
  paletteList.appendChild(button)
}

document.getElementById('grid').addEventListener('change', (event) => {
  state.grid = event.target.checked
  draw()
})

document.getElementById('mirror').addEventListener('change', (event) => {
  state.mirror = event.target.checked
})

document.getElementById('slice-enabled').addEventListener('change', (event) => {
  state.sliceEnabled = event.target.checked
  upload()
  draw()
})

document.getElementById('slice').addEventListener('input', (event) => {
  state.slice = Number(event.target.value)
  upload()
  draw()
})

document.getElementById('undo').addEventListener('click', undo)
document.getElementById('redo').addEventListener('click', redo)

document.getElementById('reset').addEventListener('click', () => {
  loadModel()
})

let clearArmed = false
let clearTimer = 0

function disarmClear() {
  clearArmed = false
  clearButton.textContent = 'Clear all'
  clearButton.classList.remove('armed')
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = 0
  }
}

function clearAll() {
  if (state.cells.size === 0) {
    disarmClear()
    status.textContent = 'Nothing to clear.'
    return
  }
  if (!clearArmed) {
    clearArmed = true
    clearButton.textContent = 'Click again to clear'
    clearButton.classList.add('armed')
    clearTimer = setTimeout(disarmClear, 4000)
    status.textContent = 'Click "Clear all" again to remove ' + state.cells.size + ' voxels.'
    return
  }
  const removed = state.cells.size
  pushUndo()
  state.cells.clear()
  disarmClear()
  upload()
  draw()
  status.textContent = 'Cleared ' + removed + ' voxels. Ctrl+Z to undo.'
}

clearButton.addEventListener('click', clearAll)

function resampleCells(resolution) {
  const copy = new Map()
  if (state.cells.size === 0) {
    return copy
  }
  const scale = resolution / state.resolution
  if (scale >= 1) {
    const area = bounds()
    const minimum = [
      Math.floor(area.min[0] * scale),
      Math.floor(area.min[1] * scale),
      Math.floor(area.min[2] * scale),
    ]
    const maximum = [
      Math.ceil(area.max[0] * scale),
      Math.ceil(area.max[1] * scale),
      Math.ceil(area.max[2] * scale),
    ]
    for (let x = minimum[0]; x < maximum[0]; x += 1) {
      for (let y = minimum[1]; y < maximum[1]; y += 1) {
        for (let z = minimum[2]; z < maximum[2]; z += 1) {
          const index = state.cells.get(key(
            Math.floor((x + 0.5) / scale),
            Math.floor((y + 0.5) / scale),
            Math.floor((z + 0.5) / scale),
          ))
          if (index !== undefined) {
            copy.set(key(x, y, z), index)
          }
        }
      }
    }
    return copy
  }
  for (const [location, index] of state.cells) {
    const parts = location.split(',').map(Number)
    copy.set(key(
      Math.floor((parts[0] + 0.5) * scale),
      Math.floor((parts[1] + 0.5) * scale),
      Math.floor((parts[2] + 0.5) * scale),
    ), index)
  }
  return copy
}

function changeResolution(value) {
  value = Math.round(Number(value) || 0)
  if (!RESOLUTIONS.includes(value)) {
    resolutionSelect.value = String(state.resolution)
    return
  }
  if (value === state.resolution) {
    resolutionSelect.value = String(state.resolution)
    return
  }
  const scale = value / state.resolution
  if (scale > 1 && state.cells.size * scale * scale * scale > 1500000) {
    resolutionSelect.value = String(state.resolution)
    status.textContent = 'Too many voxels to switch to resolution ' + value + '.'
    return
  }
  disarmClear()
  pushUndo()
  state.cells = resampleCells(value)
  state.resolution = value
  resetCamera()
  upload()
  draw()
  status.textContent = 'Resolution changed to ' + value + '.'
}

resolutionSelect.addEventListener('change', (event) => {
  changeResolution(Number(event.target.value))
})

document.getElementById('save').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelJson()),
    })
    if (!response.ok) {
      throw new Error(String(response.status))
    }
    status.textContent = 'Saved to the game.'
  } catch (error) {
    status.textContent = 'Could not save: ' + error
  }
})

document.getElementById('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(modelJson(), null, 2) + '\n'], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'ears.json'
  link.click()
  URL.revokeObjectURL(link.href)
})

document.getElementById('import').addEventListener('click', () => {
  document.getElementById('file').click()
})

document.getElementById('file').addEventListener('change', (event) => {
  const file = event.target.files[0]
  if (!file) {
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    try {
      parseModel(String(reader.result))
      pushUndo()
      resetCamera()
      upload()
      draw()
      status.textContent = ''
    } catch (error) {
      status.textContent = 'Could not read the file.'
    }
  }
  reader.readAsText(file)
  event.target.value = ''
})

async function loadConfig() {
  try {
    const response = await fetch('/api/config')
    if (!response.ok) {
      return
    }
    const config = await response.json()
    document.getElementById('enabled').checked = config.enabled
    document.getElementById('self-only').checked = config.selfOnly
    distanceInput.value = config.distance
    distanceValue.textContent = config.distance
  } catch (error) {
    status.textContent = String(error)
  }
}

distanceInput.addEventListener('input', () => {
  distanceValue.textContent = distanceInput.value
})

document.getElementById('save-config').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: document.getElementById('enabled').checked,
        selfOnly: document.getElementById('self-only').checked,
        distance: Number(document.getElementById('distance').value),
      }),
    })
    if (!response.ok) {
      throw new Error(String(response.status))
    }
    status.textContent = 'Settings saved.'
  } catch (error) {
    status.textContent = 'Could not save settings: ' + error
  }
})

async function loadModel() {
  disarmClear()
  const response = await fetch('/api/model')
  if (!response.ok) {
    status.textContent = 'Could not load the model.'
    return
  }
  parseModel(await response.text())
  state.undo.length = 0
  state.redo.length = 0
  updateHistory()
  resetCamera()
  upload()
  draw()
}

window.addEventListener('resize', () => draw())

window.addEventListener('keydown', (event) => {
  if (!event.ctrlKey && !event.metaKey) {
    return
  }
  if (event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) {
      redo()
    } else {
      undo()
    }
  } else if (event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
  }
})

if (initGl()) {
  loadConfig()
  loadModel()
}
