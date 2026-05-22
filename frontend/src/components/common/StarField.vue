<template>
  <canvas ref="canvas" class="starfield" :style="{ opacity }"/>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{ opacity?: number }>()
const canvas = ref<HTMLCanvasElement>()
let animId = 0

onMounted(() => {
  const c = canvas.value!
  const ctx = c.getContext('2d')!
  let w = 0, h = 0
  const stars: { x: number; y: number; r: number; a: number; v: number; t: number }[] = []

  function resize() {
    w = c.width = c.parentElement!.clientWidth
    h = c.height = c.parentElement!.clientHeight
  }
  resize()
  window.addEventListener('resize', resize)

  // Generate stars
  for (let i = 0; i < 120; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.5 + 0.3,
      a: Math.random(),
      v: 0.003 + Math.random() * 0.01,
      t: Math.random() * Math.PI * 2,
    })
  }

  function draw() {
    ctx.clearRect(0, 0, w, h)
    for (const s of stars) {
      s.a += s.v
      if (s.a > 1) { s.a = 0; s.x = Math.random() * w; s.y = Math.random() * h }
      const alpha = Math.sin(s.a * Math.PI) * 0.6
      ctx.beginPath()
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(0, 212, 255, ${alpha})`
      ctx.fill()
      // Glow
      if (s.r > 1) {
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0, 212, 255, ${alpha * 0.15})`
        ctx.fill()
      }
    }
    animId = requestAnimationFrame(draw)
  }
  draw()

  onUnmounted(() => {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  })
})
</script>

<style scoped>
.starfield {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
</style>
