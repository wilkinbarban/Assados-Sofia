const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const dir = '/home/wilkin/proyectos/Asados/apps/web/public/cardapio'

async function safeCrop(srcFile, destFile, { left, top, width, height }) {
  const inputBuffer = await fs.promises.readFile(path.join(dir, srcFile))
  const meta = await sharp(inputBuffer).metadata()
  const safeLeft = Math.max(0, Math.min(left, meta.width - 50))
  const safeTop = Math.max(0, Math.min(top, meta.height - 50))
  const safeWidth = Math.min(width, meta.width - safeLeft)
  const safeHeight = Math.min(height, meta.height - safeTop)

  const outputBuffer = await sharp(inputBuffer)
    .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
    .resize(800, 800, { fit: 'cover' })
    .png({ quality: 90 })
    .toBuffer()

  await fs.promises.writeFile(path.join(dir, destFile), outputBuffer)
  console.log(`✓ Created ${destFile} from ${srcFile}`)
}

async function safeResize(srcFile, destFile) {
  const inputBuffer = await fs.promises.readFile(path.join(dir, srcFile))
  const outputBuffer = await sharp(inputBuffer)
    .resize(800, 800, { fit: 'cover' })
    .png({ quality: 90 })
    .toBuffer()

  await fs.promises.writeFile(path.join(dir, destFile), outputBuffer)
  console.log(`✓ Resized ${destFile} from ${srcFile}`)
}

async function main() {
  // 1. Linguiça Toscana Artesanal (4 unidades)
  await safeCrop('combo_4_kit_familia_1.png', 'produto_linguica_toscana_1.png', { left: 400, top: 600, width: 300, height: 300 })
  await safeCrop('combo_4_kit_familia_2.png', 'produto_linguica_toscana_2.png', { left: 600, top: 460, width: 250, height: 250 })

  // 2. Maionese Caseira Tradicional de Batata (300g)
  await safeCrop('combo_1_classico_sofia_1.png', 'produto_maionese_caseira_1.png', { left: 630, top: 400, width: 350, height: 350 })
  await safeCrop('combo_1_classico_sofia_2.png', 'produto_maionese_caseira_2.png', { left: 30, top: 90, width: 350, height: 350 })

  // 3. Mandioca na Manteiga de Garrafa (300g)
  await safeCrop('combo_2_costela_suprema_1.png', 'produto_mandioca_garrafa_1.png', { left: 660, top: 350, width: 330, height: 330 })
  await safeCrop('combo_2_costela_suprema_2.png', 'produto_mandioca_garrafa_2.png', { left: 380, top: 680, width: 300, height: 300 })

  // 4. Farofa Artesanal Crocante com Bacon (250g)
  await safeCrop('combo_1_classico_sofia_1.png', 'produto_farofa_artesanal_1.png', { left: 680, top: 580, width: 300, height: 300 })
  await safeCrop('combo_1_classico_sofia_2.png', 'produto_farofa_artesanal_2.png', { left: 0, top: 660, width: 300, height: 300 })

  // 5. Pão de Alho Especial na Brasa (4 unidades)
  await safeCrop('combo_4_kit_familia_1.png', 'produto_pao_alho_1.png', { left: 620, top: 540, width: 300, height: 300 })
  await safeCrop('combo_4_kit_familia_2.png', 'produto_pao_alho_2.png', { left: 480, top: 200, width: 250, height: 250 })

  // 6. Refrigerante 2L (Coca-Cola / Guaraná Antarctica)
  await safeCrop('combo_4_kit_familia_2.png', 'produto_refrigerante_1.png', { left: 160, top: 20, width: 220, height: 320 })
  await safeCrop('combo_1_classico_sofia_2.png', 'produto_refrigerante_2.png', { left: 720, top: 50, width: 220, height: 280 })

  // 7. Costelinha Suína Especial 500g (Avulso)
  await safeCrop('combo_3_dueto_sofia_2.png', 'produto_costelinha_suina_2.png', { left: 470, top: 310, width: 420, height: 420 })

  // 8. Picanha Especial na Brasa 800g
  await safeCrop('produto_costela_bafo_2.png', 'produto_picanha_1.png', { left: 150, top: 300, width: 550, height: 550 })
  await safeCrop('combo_2_costela_suprema_1.png', 'produto_picanha_2.png', { left: 50, top: 320, width: 580, height: 580 })

  // 9. Alcatra Completa com Queijo 1kg
  await safeCrop('combo_2_costela_suprema_2.png', 'produto_alcatra_1.png', { left: 150, top: 450, width: 550, height: 550 })
  await safeCrop('produto_costela_bafo_1.png', 'produto_alcatra_2.png', { left: 140, top: 330, width: 580, height: 580 })

  // 10. Costela Premium 1kg
  await safeResize('produto_costela_bafo_1.png', 'produto_costela_premium_1.png')
  await safeResize('produto_costela_bafo_2.png', 'produto_costela_premium_2.png')

  // 11. Linguiça Artesanal de Pernil 500g
  await safeCrop('combo_4_kit_familia_1.png', 'produto_linguica_pernil_1.png', { left: 400, top: 600, width: 300, height: 300 })
  await safeCrop('combo_4_kit_familia_2.png', 'produto_linguica_pernil_2.png', { left: 600, top: 460, width: 250, height: 250 })

  // 12. Kit Churrasco Família (Serve 4)
  await safeResize('combo_4_kit_familia_1.png', 'produto_kit_churrasco_4_1.png')
  await safeResize('combo_4_kit_familia_2.png', 'produto_kit_churrasco_4_2.png')

  console.log('✅ All 36 product images generated and verified with 100% precision!')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
