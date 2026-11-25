/**
 * Reference implementation module. Teaching focus: how the Create-A-Wrestler proof of concept separates pure asset recipes from DOM and Babylon side effects.
 * File: reference/create-a-wrestler-poc/js/stage.js
 *
 * Read the public types and exported functions first; callers show how this
 * module participates in the larger data → rules → presentation pipeline.
 */
/* The 3D stage: a Babylon.js scene that assembles a wrestler from the recipe LookBook
   builds. Starter assets: every body part is its own mesh bound rigidly to one bone of the
   armature, all parts share one material whose texture is the composed atlas. ROM assets:
   every part samples its own composed slot tile with that tile's wrap mode, and is skinned to
   the same armature so seam vertices follow the neighbouring bone, as AKI Anvil binds them. */
import { BODY_SLOTS } from './look.js'

const B = window.BABYLON
const WRAP = { mirror: 'MIRROR_ADDRESSMODE', repeat: 'WRAP_ADDRESSMODE', clamp: 'CLAMP_ADDRESSMODE' }

export class Stage {
  constructor(canvas, manifest, composer) {
    this.canvas = canvas
    this.manifest = manifest
    this.composer = composer
    this.skeleton = manifest.skeleton
    this.joints = Object.fromEntries(this.skeleton.bones.map((bone) => [bone.name, bone.joint]))
    this.containers = new Map()
    this.geometry = new Map()
    this.state = { model: true, figure: false, textured: true, rotate: true, playing: true, boneScale: 1.2 }
    this.figureParts = []
    this.buildTicket = 0
    this.heightScale = 1

    this.engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, alpha: true, premultipliedAlpha: false, antialias: true })
    this.engine.setHardwareScalingLevel(1 / Math.min(2, window.devicePixelRatio || 1))
    const scene = new B.Scene(this.engine)
    this.scene = scene
    scene.useRightHandedSystem = true
    scene.clearColor = new B.Color4(0, 0, 0, 0)
    scene.ambientColor = new B.Color3(0.35, 0.35, 0.38)

    this.camera = new B.ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2 - 0.06, 4.1, new B.Vector3(0, 0.98, 0), scene)
    this.camera.lowerRadiusLimit = 1.2
    this.camera.upperRadiusLimit = 12
    this.camera.wheelDeltaPercentage = 0.01
    this.camera.minZ = 0.05
    this.camera.fov = 0.62
    this.camera.panningSensibility = 2000
    this.camera.attachControl(canvas, true)
    this.camera.onViewMatrixChangedObservable.add(() => {})
    canvas.addEventListener('pointerdown', () => { this.userTurning = true })
    window.addEventListener('pointerup', () => { this.userTurning = false })

    const sky = new B.HemisphericLight('sky', new B.Vector3(0.2, 1, 0.4), scene)
    sky.intensity = 0.62
    sky.groundColor = new B.Color3(0.22, 0.2, 0.2)
    const key = new B.DirectionalLight('key', new B.Vector3(-0.45, -0.6, -0.65), scene)
    key.intensity = 0.72
    const rim = new B.DirectionalLight('rim', new B.Vector3(0.6, -0.2, 0.7), scene)
    rim.intensity = 0.28
    rim.diffuse = new B.Color3(1, 0.75, 0.55)

    this.atlas = new B.DynamicTexture('atlas', { width: 512, height: 512 }, scene, false, B.Texture.BILINEAR_SAMPLINGMODE)
    this.atlas.wrapU = B.Texture.CLAMP_ADDRESSMODE
    this.atlas.wrapV = B.Texture.CLAMP_ADDRESSMODE
    this.material = new B.StandardMaterial('wrestler', scene)
    this.material.diffuseTexture = this.atlas
    // The GLB meshes wind counter-clockwise, as glTF does.
    this.material.sideOrientation = B.Material.CounterClockWiseSideOrientation
    this.material.specularColor = new B.Color3(0.08, 0.08, 0.08)
    this.material.specularPower = 24
    this.material.ambientColor = new B.Color3(1, 1, 1)
    this.clay = new B.Color3(0.84, 0.82, 0.8)

    this.makeFloor()
    this.makeSkeletonMarks()
    this.root = new B.TransformNode('figure', scene)
    this.bones = {}
    for (const bone of this.skeleton.bones) this.bones[bone.name] = new B.TransformNode(bone.name, scene)
    for (const bone of this.skeleton.bones) {
      const node = this.bones[bone.name]
      node.parent = bone.parent ? this.bones[bone.parent] : this.root
      const parentJoint = bone.parent ? this.joints[bone.parent] : [0, 0, 0]
      node.position = new B.Vector3(bone.joint[0] - parentJoint[0], bone.joint[1] - parentJoint[1], bone.joint[2] - parentJoint[2])
      node.rotationQuaternion = null
    }
    this.applyScale()
    this.rom = manifest.kind === 'rom'
    if (this.rom) this.makeRig()

    this.clock = 0
    scene.onBeforeRenderObservable.add(() => this.tick())
    this.engine.runRenderLoop(() => scene.render())
    this.resizer = new ResizeObserver(() => this.engine.resize())
    this.resizer.observe(canvas.parentElement)
  }

  makeFloor() {
    const size = 256
    const texture = new B.DynamicTexture('floor', { width: size, height: size }, this.scene, false)
    const context = texture.getContext()
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(0,0,0,0.55)')
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.25)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
    texture.hasAlpha = true
    texture.update()
    const material = new B.StandardMaterial('floor', this.scene)
    material.diffuseTexture = texture
    material.useAlphaFromDiffuseTexture = true
    material.disableLighting = true
    material.emissiveColor = new B.Color3(1, 1, 1)
    this.floor = B.MeshBuilder.CreateGround('shadow', { width: 1.4, height: 1.1 }, this.scene)
    this.floor.material = material
    this.floor.position.y = 0.002
    this.floor.isPickable = false
  }

  makeSkeletonMarks() {
    const material = new B.StandardMaterial('bones', this.scene)
    material.emissiveColor = new B.Color3(0.96, 0.5, 0.25)
    material.diffuseColor = new B.Color3(0, 0, 0)
    material.specularColor = new B.Color3(0, 0, 0)
    material.disableLighting = true
    material.alpha = 0.92
    const jointMaterial = material.clone('joints')
    jointMaterial.emissiveColor = new B.Color3(1, 0.86, 0.72)
    this.stickBase = B.MeshBuilder.CreateCylinder('stick', { height: 1, diameter: 1, tessellation: 10 }, this.scene)
    this.stickBase.material = material
    this.stickBase.renderingGroupId = 1
    this.stickBase.isVisible = false
    this.jointBase = B.MeshBuilder.CreateSphere('joint', { diameter: 1, segments: 8 }, this.scene)
    this.jointBase.material = jointMaterial
    this.jointBase.renderingGroupId = 1
    this.jointBase.isVisible = false
    this.headBase = B.MeshBuilder.CreateTorus('headRing', { diameter: 1, thickness: 0.06, tessellation: 32 }, this.scene)
    this.headBase.material = material
    this.headBase.isVisible = false
    this.sticks = this.skeleton.links.map(([from, to]) => {
      const stick = this.stickBase.createInstance(`stick-${from}-${to}`)
      stick.isPickable = false
      return { from, to, mesh: stick }
    })
    this.jointMarks = this.skeleton.bones.map((bone) => {
      const mark = this.jointBase.createInstance(`joint-${bone.name}`)
      mark.isPickable = false
      return { bone: bone.name, mesh: mark }
    })
    this.headMark = this.headBase.clone('headMark')
    this.headMark.isVisible = true
    this.headMark.renderingGroupId = 1
    this.scene.setRenderingAutoClearDepthStencil(1, true)
  }

  setHeight(scale) {
    this.heightScale = Math.min(1.25, Math.max(0.82, scale))
    this.applyScale()
  }

  applyScale() {
    const scale = this.skeleton.unit * this.heightScale * (this.buildScale ?? 1)
    this.root.scaling.setAll(scale)
    this.root.position.y = -this.skeleton.floor * scale
    this.camera.target.y = 0.98 * this.heightScale
    if (this.floor) this.floor.scaling.setAll(this.heightScale)
  }

  async container(url) {
    if (!this.containers.has(url)) {
      this.containers.set(url, (async () => {
        const index = url.lastIndexOf('/')
        const container = await B.SceneLoader.LoadAssetContainerAsync(this.manifest.root + url.slice(0, index + 1), url.slice(index + 1), this.scene)
        const parts = new Map()
        for (const mesh of container.meshes) {
          if (!mesh.getTotalVertices || !mesh.getTotalVertices()) continue
          // ROM GLBs name each node uniquely (a model can fill any slot); starter GLBs by slot.
          const slot = this.rom ? mesh.name : mesh.metadata?.gltf?.extras?.slot ?? mesh.name
          parts.set(slot, B.VertexData.ExtractFromMesh(mesh, true, true))
        }
        container.dispose()
        return parts
      })())
    }
    return this.containers.get(url)
  }

  /** Build the figure for a recipe. Meshes load once and are cached; the atlas is
      recomposed every time. Returns a summary for the UI. */
  async build(recipe) {
    if (recipe.kind === 'rom') return this.buildRom(recipe)
    const ticket = (this.buildTicket += 1)
    const slots = new Map()
    const body = await this.container(recipe.body)
    for (const slot of BODY_SLOTS) if (body.has(slot)) slots.set(slot, { data: body.get(slot), source: recipe.body })
    for (const swap of recipe.swaps) {
      const parts = await this.container(swap.url)
      for (const [slot, data] of parts) slots.set(slot, { data, source: swap.url })
    }
    const head = await this.container(recipe.head.url)
    const attachments = []
    for (const attachment of recipe.attachments) {
      const parts = await this.container(attachment.mesh)
      for (const [slot, data] of parts) attachments.push({ slot, data, fit: attachment.fit, source: attachment.mesh })
    }
    const context = this.atlas.getContext()
    const problems = await this.composer.compose(recipe.layers, context)
    if (ticket !== this.buildTicket) return null
    this.atlas.update(false)

    for (const part of this.figureParts) part.dispose()
    this.figureParts = []
    const place = (name, data, bone, offset) => {
      const mesh = new B.Mesh(name, this.scene)
      data.applyToMesh(mesh, false)
      mesh.material = this.material
      mesh.parent = bone
      mesh.position = new B.Vector3(-offset[0], -offset[1], -offset[2])
      mesh.isPickable = false
      mesh.isVisible = this.state.model
      this.figureParts.push(mesh)
      return mesh
    }
    for (const [slot, entry] of slots) {
      const boneName = this.manifest.slots[slot] ?? slot
      place(slot, entry.data, this.bones[boneName], this.joints[boneName])
    }
    if (head.has('head')) place('head', head.get('head'), this.bones.head, this.joints.head)
    const center = this.skeleton.headCenter
    const headJoint = this.joints.head
    for (const attachment of attachments) {
      const holder = new B.TransformNode(`${attachment.slot}-fit`, this.scene)
      holder.parent = this.bones.head
      holder.position = new B.Vector3(center[0] - headJoint[0], center[1] - headJoint[1], center[2] - headJoint[2])
      holder.scaling = new B.Vector3(...attachment.fit)
      this.figureParts.push(holder)
      place(attachment.slot, attachment.data, holder, center)
    }
    this.buildScale = recipe.scale
    this.applyScale()
    this.applySkin()
    return {
      parts: slots.size + (head.has('head') ? 1 : 0) + attachments.length,
      swaps: recipe.swaps.map((swap) => swap.swap),
      attachments: recipe.attachments.map((entry) => entry.slot),
      problems,
    }
  }

  /** ROM assets: a Babylon skeleton whose bones follow the armature's transform nodes. */
  makeRig() {
    const bones = this.skeleton.bones
    const byName = new Map(bones.map((bone) => [bone.name, bone]))
    this.rig = new B.Skeleton('rig', 'rig', this.scene)
    const made = new Map()
    const make = (bone) => {
      if (made.has(bone.name)) return made.get(bone.name)
      const parent = bone.parent ? make(byName.get(bone.parent)) : null
      const from = bone.parent ? this.joints[bone.parent] : [0, 0, 0]
      const local = B.Matrix.Translation(bone.joint[0] - from[0], bone.joint[1] - from[1], bone.joint[2] - from[2])
      const rigBone = new B.Bone(bone.name, this.rig, parent, local)
      rigBone.linkTransformNode(this.bones[bone.name])
      made.set(bone.name, rigBone)
      return rigBone
    }
    bones.forEach(make)
    // AKI bone number -> index in the Babylon skeleton.
    this.rigIndex = this.skeleton.boneOrder.map((name) => this.rig.bones.indexOf(made.get(name)))
  }

  /** Build the figure for a ROM recipe: one skinned mesh and one composed tile per dressed slot. */
  async buildRom(recipe) {
    const ticket = (this.buildTicket += 1)
    const m = this.manifest
    const { tiles, problems } = await this.composer.compose(recipe.plan)
    const parts = []
    for (const entry of recipe.dressed) {
      const tile = tiles[entry.slot]
      if (!tile) continue
      const model = m.models[entry.model]
      if (!model) {
        problems.push(`model ${entry.model} is not in the manifest`)
        continue
      }
      const data = (await this.container(model.src)).get(model.node)
      if (!data) problems.push(`${model.src} has no node ${model.node}`)
      else parts.push({ entry, tile, model, data })
    }
    if (ticket !== this.buildTicket) return null
    this.disposeFigure()
    this.tiles = []
    const seams = this.skeleton.seams ?? {}
    for (const { entry, tile, model, data } of parts) {
      const count = data.positions.length / 3
      const vertexData = new B.VertexData()
      vertexData.positions = data.positions
      vertexData.normals = data.normals
      vertexData.indices = data.indices
      // UVs are stored in texels; this is AKI Anvil's texelCoordinate(value, size) / size.
      const uvs = new Float32Array(count * 2)
      for (let at = 0; at < count; at += 1) {
        uvs[at * 2] = (data.uvs[at * 2] + 2 * tile.width) / tile.width
        uvs[at * 2 + 1] = (data.uvs[at * 2 + 1] + 2 * tile.height) / tile.height
      }
      vertexData.uvs = uvs
      // seamBones: the first influence>>4 vertices follow the bone's first seam neighbour,
      // the next influence&15 its second; the rest follow the part's own bone.
      const runs = seams[entry.bone] ?? [entry.bone, entry.bone]
      const first = model.influence >> 4
      const second = model.influence & 15
      const indices = new Float32Array(count * 4)
      const weights = new Float32Array(count * 4)
      for (let at = 0; at < count; at += 1) {
        const bone = at < first ? runs[0] : at < first + second ? runs[1] : entry.bone
        indices[at * 4] = this.rigIndex[bone]
        weights[at * 4] = 1
      }
      vertexData.matricesIndices = indices
      vertexData.matricesWeights = weights
      const name = m.slots.names[entry.slot] ?? `slot_${entry.slot}`
      const mesh = new B.Mesh(name, this.scene)
      vertexData.applyToMesh(mesh, false)
      mesh.skeleton = this.rig
      mesh.numBoneInfluencers = 1
      mesh.parent = this.root
      mesh.isPickable = false
      mesh.isVisible = this.state.model
      const picture = m.pictures[tile.source]
      const texture = B.RawTexture.CreateRGBATexture(new Uint8Array(tile.rgba.buffer), tile.width, tile.height, this.scene, false, false, B.Texture.BILINEAR_SAMPLINGMODE)
      texture.wrapU = B.Texture[WRAP[picture?.wrap?.[0]] ?? WRAP.repeat]
      texture.wrapV = B.Texture[WRAP[picture?.wrap?.[1]] ?? WRAP.repeat]
      texture.hasAlpha = true
      const material = new B.StandardMaterial(`${name}-material`, this.scene)
      material.diffuseTexture = texture
      // AKI Anvil draws both faces and keeps texels with alpha of a half or more.
      material.backFaceCulling = false
      material.transparencyMode = B.Material.MATERIAL_ALPHATEST
      material.alphaCutOff = 0.5
      material.specularColor = new B.Color3(0.08, 0.08, 0.08)
      material.specularPower = 24
      material.ambientColor = new B.Color3(1, 1, 1)
      mesh.material = material
      mesh.metadata = { texture, slot: entry.slot }
      this.figureParts.push(mesh)
      this.tiles.push({ slot: entry.slot, name, width: tile.width, height: tile.height, rgba: tile.rgba, source: tile.source, model: entry.model })
    }
    this.buildScale = recipe.scale
    this.applyScale()
    this.applySkin()
    return {
      parts: parts.length,
      swaps: recipe.swaps.map((swap) => swap.swap),
      attachments: [],
      problems,
    }
  }

  disposeFigure() {
    for (const part of this.figureParts) {
      if (part.metadata?.texture) {
        part.material?.dispose()
        part.metadata.texture.dispose()
      }
      part.dispose()
    }
    this.figureParts = []
  }

  atlasCanvas() {
    return this.atlas.getContext().canvas
  }

  /** ROM assets: the composed tile of every drawn slot, for the Look tab. */
  tilePictures() {
    return this.tiles ?? []
  }

  applySkin() {
    this.material.diffuseTexture = this.state.textured ? this.atlas : null
    this.material.diffuseColor = this.state.textured ? new B.Color3(1, 1, 1) : this.clay
    for (const part of this.figureParts) {
      if (part.getClassName?.() !== 'Mesh') continue
      part.isVisible = this.state.model
      if (part.metadata?.texture) {
        part.material.diffuseTexture = this.state.textured ? part.metadata.texture : null
        part.material.diffuseColor = this.state.textured ? new B.Color3(1, 1, 1) : this.clay
      }
    }
    this.floor.isVisible = true
  }

  set(option, value) {
    this.state[option] = value
    if (option === 'textured' || option === 'model') this.applySkin()
  }

  view(which) {
    // The wrestler faces +Z; alpha 90 degrees puts the camera in front, 0 on their left side.
    const target = which === 'side' ? 0 : Math.PI / 2
    this.state.rotate = false
    const start = this.camera.alpha
    let delta = (target - start) % (Math.PI * 2)
    if (delta > Math.PI) delta -= Math.PI * 2
    if (delta < -Math.PI) delta += Math.PI * 2
    const from = { alpha: start, beta: this.camera.beta }
    const began = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - began) / 420)
      const eased = 1 - Math.pow(1 - t, 3)
      this.camera.alpha = from.alpha + delta * eased
      this.camera.beta = from.beta + (Math.PI / 2 - 0.06 - from.beta) * eased
      if (t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  /** A gentle idle: breathing, arms out of the rest pose, a slow sway. */
  pose(time) {
    const b = this.bones
    const breathe = Math.sin(time * 1.9)
    const sway = Math.sin(time * 0.9)
    const arms = 0.16 + 0.025 * breathe
    b.left_upper_arm.rotation.set(0.04 * sway, 0, arms)
    b.right_upper_arm.rotation.set(-0.04 * sway, 0, -arms)
    b.left_forearm.rotation.set(-0.22 - 0.03 * breathe, 0, -0.05)
    b.right_forearm.rotation.set(-0.22 - 0.03 * breathe, 0, 0.05)
    b.left_hand.rotation.set(-0.08, 0, 0.04)
    b.right_hand.rotation.set(-0.08, 0, -0.04)
    b.left_fingers.rotation.set(-0.3, 0, 0)
    b.right_fingers.rotation.set(-0.3, 0, 0)
    b.upper_body.rotation.set(-0.02 * breathe, 0.03 * sway, 0)
    b.lower_abdomen.rotation.set(-0.01 * breathe, 0.015 * sway, 0)
    b.neck.rotation.set(0.02 * breathe, 0.06 * sway, 0)
    b.head.rotation.set(-0.02, 0.05 * sway, 0)
    b.left_upper_leg.rotation.set(-0.02, 0, 0.035)
    b.right_upper_leg.rotation.set(-0.02, 0, -0.035)
    b.left_lower_leg.rotation.set(0.04, 0, -0.01)
    b.right_lower_leg.rotation.set(0.04, 0, 0.01)
    b.left_foot.rotation.set(-0.02, 0.12, 0)
    b.right_foot.rotation.set(-0.02, -0.12, 0)
  }

  tick() {
    const dt = this.engine.getDeltaTime() / 1000
    if (this.state.playing) this.clock += dt
    this.pose(this.clock)
    if (this.state.rotate && !this.userTurning) this.camera.alpha += dt * 0.35
    const showFigure = this.state.figure
    const scale = this.root.scaling.x
    const thickness = 0.02 * this.state.boneScale * (scale / this.skeleton.unit)
    const world = (name) => this.bones[name].getAbsolutePosition()
    this.root.computeWorldMatrix(true)
    for (const bone of Object.values(this.bones)) bone.computeWorldMatrix(true)
    for (const stick of this.sticks) {
      stick.mesh.isVisible = showFigure
      if (!showFigure) continue
      const a = world(stick.from)
      const b = world(stick.to)
      const middle = a.add(b).scale(0.5)
      const direction = b.subtract(a)
      const length = direction.length()
      stick.mesh.position.copyFrom(middle)
      stick.mesh.scaling.set(thickness, Math.max(0.001, length), thickness)
      const axis = B.Vector3.Cross(B.Axis.Y, direction.normalize())
      const angle = Math.acos(Math.min(1, Math.max(-1, B.Vector3.Dot(B.Axis.Y, direction))))
      stick.mesh.rotationQuaternion = axis.lengthSquared() < 1e-8 ? B.Quaternion.Identity() : B.Quaternion.RotationAxis(axis.normalize(), angle)
    }
    for (const mark of this.jointMarks) {
      mark.mesh.isVisible = showFigure
      if (!showFigure) continue
      mark.mesh.position.copyFrom(world(mark.bone))
      mark.mesh.scaling.setAll(thickness * 1.9)
    }
    this.headMark.isVisible = showFigure
    if (showFigure) {
      const center = this.skeleton.headCenter
      const head = this.bones.head
      const local = new B.Vector3(center[0] - this.joints.head[0], center[1] - this.joints.head[1], center[2] - this.joints.head[2])
      this.headMark.position.copyFrom(B.Vector3.TransformCoordinates(local, head.getWorldMatrix()))
      this.headMark.scaling.setAll(0.24 * (scale / this.skeleton.unit))
      this.headMark.rotationQuaternion = B.Quaternion.FromEulerAngles(Math.PI / 2, -this.camera.alpha + Math.PI / 2, 0)
    }
  }

  /** Counts for the stage bar. */
  facts() {
    let vertices = 0
    let faces = 0
    let meshes = 0
    for (const part of this.figureParts) {
      if (part.getClassName?.() !== 'Mesh') continue
      meshes += 1
      vertices += part.getTotalVertices()
      faces += part.getTotalIndices() / 3
    }
    return { meshes, vertices, faces }
  }
}
