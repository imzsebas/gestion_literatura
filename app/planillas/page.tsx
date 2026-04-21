"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface DiaConVentas {
  fecha: string
  cantidadMovimientos: number
  totalMonto: number
}

interface FilaPlanilla {
  nombre: string
  libro: string
  movimiento: string
  cantidad: number | string
  valor: number | string
  abono: number | string
  pago: number | string
}

export default function PlanillasPage() {
  const router = useRouter()
  const [diasConVentas, setDiasConVentas] = useState<DiaConVentas[]>([])
  const [loading, setLoading] = useState(true)
  const [mesActual, setMesActual] = useState(new Date())
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [resumenDia, setResumenDia] = useState<{ ventas: number; monto: number } | null>(null)
  const [planillaData, setPlanillaData] = useState<{
    filas: FilaPlanilla[]
    vendedoresStr: string
    fechaFormateada: string
    totales: { cant: number; valor: number; abono: number; pago: number }
  } | null>(null)

  useEffect(() => { fetchDiasConVentas() }, [mesActual])

  const fetchDiasConVentas = async () => {
    setLoading(true)
    const inicio = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1)
    const fin = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0, 23, 59, 59)

    const { data: sales } = await supabase
      .from('sales')
      .select('id, total, created_at')
      .gte('created_at', inicio.toISOString())
      .lte('created_at', fin.toISOString())

    const { data: abonos } = await supabase
      .from('cash_movements')
      .select('created_at, amount')
      .eq('concept', 'advance')
      .gte('created_at', inicio.toISOString())
      .lte('created_at', fin.toISOString())

    const porDia: Record<string, DiaConVentas> = {}

    for (const s of sales ?? []) {
      const dia = s.created_at.split('T')[0]
      if (!porDia[dia]) porDia[dia] = { fecha: dia, cantidadMovimientos: 0, totalMonto: 0 }
      porDia[dia].cantidadMovimientos++
      porDia[dia].totalMonto += Number(s.total)
    }
    for (const a of abonos ?? []) {
      const dia = a.created_at.split('T')[0]
      if (!porDia[dia]) porDia[dia] = { fecha: dia, cantidadMovimientos: 0, totalMonto: 0 }
      porDia[dia].cantidadMovimientos++
      porDia[dia].totalMonto += Number(a.amount)
    }

    setDiasConVentas(Object.values(porDia))
    setLoading(false)
  }

  const seleccionarDia = async (fecha: string) => {
    setDiaSeleccionado(fecha)
    setPlanillaData(null)
    const inicio = `${fecha}T00:00:00`
    const fin = `${fecha}T23:59:59`
    const { data } = await supabase.from('sales').select('id, total').gte('created_at', inicio).lte('created_at', fin)
    setResumenDia({ ventas: data?.length ?? 0, monto: data?.reduce((s, v) => s + Number(v.total), 0) ?? 0 })
  }

  const cargarPlanilla = async () => {
    if (!diaSeleccionado) return
    setGenerando(true)

    const inicio = `${diaSeleccionado}T00:00:00`
    const fin = `${diaSeleccionado}T23:59:59`

    const { data: sales } = await supabase
      .from('sales')
      .select('id, payment_type, payment_method, total, advance_payment, member_id, created_by, created_at')
      .gte('created_at', inicio).lte('created_at', fin).order('created_at')

    const saleIds = (sales ?? []).map(s => s.id)
    const memberIds = [...new Set((sales ?? []).map(s => s.member_id).filter(Boolean))]
    const userIds = [...new Set((sales ?? []).map(s => s.created_by).filter(Boolean))]

    const { data: members } = memberIds.length > 0 ? await supabase.from('members').select('id, name').in('id', memberIds) : { data: [] }
    const { data: users } = userIds.length > 0 ? await supabase.from('users').select('id, name').in('id', userIds) : { data: [] }
    const { data: saleItems } = saleIds.length > 0 ? await supabase.from('sale_items').select('sale_id, quantity, sale_price_snapshot, book_id').in('sale_id', saleIds) : { data: [] }
    const bookIds = [...new Set((saleItems ?? []).map(i => i.book_id).filter(Boolean))]
    const { data: books } = bookIds.length > 0 ? await supabase.from('books').select('id, title').in('id', bookIds) : { data: [] }

    const { data: abonos } = await supabase
      .from('cash_movements')
      .select('id, amount, payment_method, sale_id, created_by, created_at')
      .eq('concept', 'advance').gte('created_at', inicio).lte('created_at', fin).order('created_at')

    const abonoSaleIds = [...new Set((abonos ?? []).map(a => a.sale_id).filter(Boolean))]
    const { data: abonoSales } = abonoSaleIds.length > 0 ? await supabase.from('sales').select('id, member_id').in('id', abonoSaleIds) : { data: [] }
    const abonoMemberIds = [...new Set((abonoSales ?? []).map(s => s.member_id).filter(Boolean))]
    const { data: abonoMembers } = abonoMemberIds.length > 0 ? await supabase.from('members').select('id, name').in('id', abonoMemberIds) : { data: [] }
    const { data: abonoItems } = abonoSaleIds.length > 0 ? await supabase.from('sale_items').select('sale_id, book_id').in('sale_id', abonoSaleIds) : { data: [] }

    const abonoUserIds = [...new Set((abonos ?? []).map(a => a.created_by).filter(Boolean))]
    const { data: abonoUsers } = abonoUserIds.length > 0 ? await supabase.from('users').select('id, name').in('id', abonoUserIds) : { data: [] }

    const membersMap = Object.fromEntries((members ?? []).map(m => [m.id, m.name]))
    const usersMap = Object.fromEntries([...(users ?? []), ...(abonoUsers ?? [])].map(u => [u.id, u.name]))
    const booksMap = Object.fromEntries((books ?? []).map(b => [b.id, b.title]))
    const abonoSalesMap = Object.fromEntries((abonoSales ?? []).map(s => [s.id, s]))
    const abonoMembersMap = Object.fromEntries((abonoMembers ?? []).map(m => [m.id, m.name]))
    const itemsBySale: Record<string, any[]> = {}
    for (const item of saleItems ?? []) {
      if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = []
      itemsBySale[item.sale_id].push(item)
    }
    const abonoBooksBySale: Record<string, string[]> = {}
    for (const item of abonoItems ?? []) {
      if (!abonoBooksBySale[item.sale_id]) abonoBooksBySale[item.sale_id] = []
      abonoBooksBySale[item.sale_id].push(booksMap[item.book_id] ?? 'Libro')
    }

    const vendedoresIds = new Set([
      ...(sales ?? []).map(s => s.created_by),
      ...(abonos ?? []).map(a => a.created_by),
    ].filter(Boolean))
    const vendedoresNombres = [...vendedoresIds].map(id => usersMap[id] ?? '').filter(Boolean)
    const vendedoresStr = vendedoresNombres.length > 0 ? vendedoresNombres.join(' / ') : '___________________'

    const filas: FilaPlanilla[] = []

    for (const sale of sales ?? []) {
      const items = itemsBySale[sale.id] ?? []
      for (const item of items) {
        const valor = item.sale_price_snapshot * item.quantity
        filas.push({
          nombre: membersMap[sale.member_id] ?? '—',
          libro: booksMap[item.book_id] ?? 'Libro',
          movimiento: sale.payment_type === 'contado' ? 'Contado'
            : sale.payment_type === 'credito' ? 'Crédito'
            : sale.payment_type === 'credi_contado' ? 'Credi-Contado'
            : 'Ofrendado',
          cantidad: item.quantity,
          valor,
          abono: sale.payment_type === 'credi_contado' ? Number(sale.advance_payment) : '',
          pago: sale.payment_type === 'contado' ? valor : '',
        })
      }
    }

    for (const abono of abonos ?? []) {
      const abonoSale = abonoSalesMap[abono.sale_id]
      const libros = abono.sale_id ? (abonoBooksBySale[abono.sale_id] ?? ['Libro']).join(', ') : 'Libro'
      filas.push({
        nombre: abonoSale ? (abonoMembersMap[abonoSale.member_id] ?? '—') : '—',
        libro: libros,
        movimiento: 'Abono',
        cantidad: '',
        valor: '',
        abono: Number(abono.amount),
        pago: '',
      })
    }

    const totales = {
      cant: filas.reduce((s, f) => s + (typeof f.cantidad === 'number' ? f.cantidad : 0), 0),
      valor: filas.reduce((s, f) => s + (typeof f.valor === 'number' ? f.valor : 0), 0),
      abono: filas.reduce((s, f) => s + (typeof f.abono === 'number' ? f.abono : 0), 0),
      pago: filas.reduce((s, f) => s + (typeof f.pago === 'number' ? f.pago : 0), 0),
    }

    const fechaFormateada = new Date(diaSeleccionado + 'T12:00:00').toLocaleDateString('es-CO', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    })

    setPlanillaData({ filas, vendedoresStr, fechaFormateada, totales })
    setGenerando(false)
  }

  const descargarExcel = async () => {
    if (!planillaData || !diaSeleccionado) return

    // xlsx-js-style soporta estilos reales (colores, bordes, fuentes).
    // Se importa dinámicamente para no romper el bundle si no está instalado aún.
    // npm install xlsx-js-style  (o yarn add xlsx-js-style)
    const XLSXStyle = (await import('xlsx-js-style')).default

    const { filas, vendedoresStr, fechaFormateada, totales } = planillaData

    // ── Paleta (igual a la UI) ──────────────────────────────────────────────
    const C = {
      azulOscuro:   '1A3A6B',
      azulMedio:    '2E5EAA',
      azulClaro:    'D6E4F7',
      azulHeader:   '3A6BC8',
      grisFila:     'F4F7FB',
      blanco:       'FFFFFF',
      grisTexto:    '4A5568',
      grisBorde:    'CBD5E0',
      // badges movimiento (mismos que la UI)
      verdeClaro:   'D6F5E6', verdeTexto:   '1A7A4A',
      rojoClaro:    'FFE8E8', rojoTexto:    'B91C1C',
      amarillo:     'FFF8DC', amarilloTxt:  '92400E',
      naranja:      'FFF0E0', naranjaTxt:   'C2410C',
    }

    // ── Helpers de borde ────────────────────────────────────────────────────
    const borde = (style: string, color: string) => ({ style, color: { rgb: color } })
    const bordeDelgado  = { top: borde('thin','CBD5E0'), bottom: borde('thin','CBD5E0'), left: borde('thin','CBD5E0'), right: borde('thin','CBD5E0') }
    const bordeHeader   = { top: borde('thin',C.azulOscuro), bottom: borde('thin',C.azulOscuro), left: borde('thin',C.azulOscuro), right: borde('thin',C.azulOscuro) }
    const bordeTotales  = { top: borde('medium',C.azulOscuro), bottom: borde('medium',C.azulOscuro), left: borde('thin',C.azulOscuro), right: borde('thin',C.azulOscuro) }

    // ── Fábrica de estilos ──────────────────────────────────────────────────
    const sTitulo = {
      font: { bold: true, sz: 16, color: { rgb: C.blanco }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.azulOscuro } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
    const sSubtitulo = {
      font: { bold: true, sz: 12, color: { rgb: C.blanco }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.azulMedio } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
    const sFecha = {
      font: { bold: true, sz: 11, color: { rgb: C.azulOscuro }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.azulClaro } },
      alignment: { horizontal: 'left', vertical: 'center' },
    }
    const sVendedor = { ...sFecha, alignment: { horizontal: 'right', vertical: 'center' } }
    const sHeader = {
      font: { bold: true, sz: 11, color: { rgb: C.blanco }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.azulHeader } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: bordeHeader,
    }
    const sDato = (par: boolean) => ({
      font: { sz: 10, color: { rgb: C.grisTexto }, name: 'Calibri' },
      fill: { fgColor: { rgb: par ? C.grisFila : C.blanco } },
      alignment: { vertical: 'center', wrapText: false },
      border: bordeDelgado,
    })
    const sNum = (par: boolean) => ({
      ...sDato(par),
      alignment: { horizontal: 'right', vertical: 'center' },
      numFmt: '#,##0',
    })
    // Colores de badge por movimiento — idénticos a la UI
    const movColors: Record<string, { bg: string; fg: string }> = {
      'Contado':       { bg: C.verdeClaro,  fg: C.verdeTexto  },
      'Crédito':       { bg: C.rojoClaro,   fg: C.rojoTexto   },
      'Credi-Contado': { bg: C.amarillo,    fg: C.amarilloTxt },
      'Ofrendado':     { bg: C.naranja,     fg: C.naranjaTxt  },
      'Abono':         { bg: C.azulClaro,   fg: C.azulOscuro  },
    }
    const sMov = (tipo: string) => {
      const mc = movColors[tipo] ?? { bg: C.blanco, fg: C.grisTexto }
      return {
        font: { bold: true, sz: 10, color: { rgb: mc.fg }, name: 'Calibri' },
        fill: { fgColor: { rgb: mc.bg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: bordeDelgado,
      }
    }
    const sTotalLabel = {
      font: { bold: true, sz: 11, color: { rgb: C.blanco }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.azulOscuro } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: bordeTotales,
    }
    const sTotal = {
      font: { bold: true, sz: 11, color: { rgb: C.blanco }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.azulOscuro } },
      alignment: { horizontal: 'right', vertical: 'center' },
      numFmt: '#,##0',
      border: bordeTotales,
    }
    const sResumenLabel = {
      font: { bold: true, sz: 10, color: { rgb: C.blanco }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.azulMedio } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { top: borde('thin',C.azulOscuro), bottom: borde('thin',C.azulOscuro), left: borde('thin',C.azulOscuro), right: borde('thin',C.azulOscuro) },
    }
    const sResumenVal = (color: string) => ({
      font: { bold: true, sz: 12, color: { rgb: color }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.blanco } },
      alignment: { horizontal: 'center', vertical: 'center' },
      numFmt: '#,##0',
      border: { top: borde('thin',C.azulMedio), bottom: borde('medium',C.azulMedio), left: borde('thin',C.azulMedio), right: borde('thin',C.azulMedio) },
    })
    const sSeccion = {
      font: { bold: true, sz: 11, color: { rgb: C.blanco }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.azulMedio } },
      alignment: { horizontal: 'left', vertical: 'center' },
    }
    const sTextoLabel = {
      font: { bold: true, sz: 10, color: { rgb: C.azulOscuro }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.azulClaro } },
      alignment: { vertical: 'top', wrapText: true },
    }
    const sTextoDesc = {
      font: { sz: 10, color: { rgb: C.grisTexto }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.blanco } },
      alignment: { vertical: 'top', wrapText: true },
    }
    const sNota = {
      font: { italic: true, sz: 10, color: { rgb: C.azulMedio }, name: 'Calibri' },
      fill: { fgColor: { rgb: C.azulClaro } },
      alignment: { wrapText: true, vertical: 'center' },
    }

    // ── Construcción de la hoja ─────────────────────────────────────────────
    const wb = XLSXStyle.utils.book_new()
    const ws: any = {}

    const sc = (row: number, col: number, value: any, style: any = {}) => {
      const addr = XLSXStyle.utils.encode_cell({ r: row, c: col })
      ws[addr] = { v: value ?? '', t: typeof value === 'number' ? 'n' : 's', s: style }
      if (typeof value === 'number' && style.numFmt) ws[addr].z = style.numFmt
    }
    const fill7 = (row: number, style: any) => { for (let c = 0; c <= 6; c++) sc(row, c, '', style) }

    let r = 0

    // Fila 0 — Título principal
    sc(r, 0, 'IGLESIA EN MONTERÍA — SERVICIO DE LITERATURA', sTitulo)
    for (let c = 1; c <= 6; c++) sc(r, c, '', sTitulo)
    r++

    // Fila 1 — Subtítulo
    sc(r, 0, 'FORMATO DE DISTRIBUCIÓN Y CONTROL DE VENTAS', sSubtitulo)
    for (let c = 1; c <= 6; c++) sc(r, c, '', sSubtitulo)
    r++

    // Fila 2 — Fecha | Vendedor
    sc(r, 0, `FECHA: ${fechaFormateada}`, sFecha)
    sc(r, 1, '', sFecha); sc(r, 2, '', sFecha); sc(r, 3, '', sFecha)
    sc(r, 4, `VENDEDOR(A): ${vendedoresStr}`, sVendedor)
    sc(r, 5, '', sVendedor); sc(r, 6, '', sVendedor)
    r++

    // Fila 3 — Espacio vacío
    fill7(r, { fill: { fgColor: { rgb: 'EEF2FA' } } }); r++

    // Fila 4 — Encabezados de tabla
    const HEADERS = ['NOMBRES', 'LIBRO', 'MOVIMIENTO', 'CANT.', 'VALOR', 'ABONÓ', 'PAGÓ']
    HEADERS.forEach((h, c) => sc(r, c, h, sHeader)); r++

    // Filas de datos
    const dataStartRow = r
    filas.forEach((fila, idx) => {
      const par = idx % 2 === 0
      sc(r, 0, fila.nombre,     { ...sDato(par), font: { ...sDato(par).font, bold: true } })
      sc(r, 1, fila.libro,      sDato(par))
      sc(r, 2, fila.movimiento, sMov(fila.movimiento))
      sc(r, 3, fila.cantidad === '' ? '' : fila.cantidad,
        typeof fila.cantidad === 'number' ? sNum(par) : sDato(par))
      sc(r, 4, fila.valor === '' ? '' : fila.valor,
        typeof fila.valor === 'number' ? { ...sNum(par) } : sDato(par))
      sc(r, 5, fila.abono === '' ? '' : fila.abono,
        typeof fila.abono === 'number' ? { ...sNum(par), font: { ...sNum(par).font, bold: true, color: { rgb: C.azulMedio } } } : sDato(par))
      sc(r, 6, fila.pago === '' ? '' : fila.pago,
        typeof fila.pago === 'number' ? { ...sNum(par), font: { ...sNum(par).font, bold: true, color: { rgb: C.verdeTexto } } } : sDato(par))
      r++
    })

    // Fila de TOTALES
    sc(r, 0, 'TOTALES', sTotalLabel)
    sc(r, 1, '', sTotalLabel); sc(r, 2, '', sTotalLabel)
    sc(r, 3, totales.cant,   sTotal)
    sc(r, 4, totales.valor,  sTotal)
    sc(r, 5, totales.abono,  sTotal)
    sc(r, 6, totales.pago,   sTotal)
    const totalesRow = r; r++

    // Fila vacía separadora
    fill7(r, { fill: { fgColor: { rgb: 'EEF2FA' } } }); r++

    // ── Bloque resumen visual (igual a los cards de la UI) ──────────────────
    // Labels
    const resumenLabels = ['LIBROS', 'VALOR TOTAL', 'TOTAL ABONADO', 'TOTAL PAGADO']
    resumenLabels.forEach((lbl, i) => sc(r, i * 1 + (i === 0 ? 0 : i === 1 ? 1 : i === 2 ? 3 : 5), lbl, sResumenLabel))
    // Ajuste manual de columnas del resumen (cols 0,1-2,3-4,5-6)
    sc(r, 0, 'LIBROS',          sResumenLabel)
    sc(r, 1, 'VALOR TOTAL',     sResumenLabel); sc(r, 2, '', sResumenLabel)
    sc(r, 3, 'TOTAL ABONADO',   sResumenLabel); sc(r, 4, '', sResumenLabel)
    sc(r, 5, 'TOTAL PAGADO',    sResumenLabel); sc(r, 6, '', sResumenLabel)
    const resumenLabelRow = r; r++

    // Valores del resumen
    sc(r, 0, totales.cant,   { ...sResumenVal(C.azulOscuro), numFmt: '0' })
    sc(r, 1, totales.valor,  sResumenVal(C.grisTexto));    sc(r, 2, '', sResumenVal(C.grisTexto))
    sc(r, 3, totales.abono,  sResumenVal(C.azulMedio));    sc(r, 4, '', sResumenVal(C.azulMedio))
    sc(r, 5, totales.pago,   sResumenVal(C.verdeTexto));   sc(r, 6, '', sResumenVal(C.verdeTexto))
    const resumenValRow = r; r++

    // Fila separadora
    fill7(r, { fill: { fgColor: { rgb: 'EEF2FA' } } }); r++

    // ── Leyenda de tipos de movimiento ──────────────────────────────────────
    sc(r, 0, 'TIPOS DE MOVIMIENTO', sSeccion)
    for (let c = 1; c <= 6; c++) sc(r, c, '', sSeccion)
    const leyendaHeaderRow = r; r++

    const tiposLeyenda = ['Contado', 'Crédito', 'Credi-Contado', 'Ofrendado', 'Abono']
    // Fila de etiquetas de colores
    tiposLeyenda.forEach((t, i) => {
      const mc = movColors[t] ?? { bg: C.blanco, fg: C.grisTexto }
      sc(r, i < 5 ? i : i, t, {
        font: { bold: true, sz: 10, color: { rgb: mc.fg }, name: 'Calibri' },
        fill: { fgColor: { rgb: mc.bg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: bordeDelgado,
      })
    })
    // Celda 5 y 6 vacías con fondo neutro
    sc(r, 5, '', { fill: { fgColor: { rgb: C.blanco } } })
    sc(r, 6, '', { fill: { fgColor: { rgb: C.blanco } } })
    r++

    // Fila separadora
    fill7(r, { fill: { fgColor: { rgb: 'EEF2FA' } } }); r++

    // ── Sección conceptos ───────────────────────────────────────────────────
    sc(r, 0, 'CONCEPTOS DE MOVIMIENTOS', sSeccion)
    for (let c = 1; c <= 6; c++) sc(r, c, '', sSeccion)
    const conceptosHeaderRow = r; r++

    const conceptos = [
      ['Contado',       'Venta de contado: El cliente compró un libro y canceló el valor total en el momento de la entrega.'],
      ['Crédito',       'El cliente recibió el libro pero no realizó ningún pago. Queda con deuda total.'],
      ['Credi-Contado', 'El cliente dio un abono inicial. El valor restante queda registrado como deuda pendiente.'],
      ['Ofrendado',     'El libro fue obsequiado por el negocio. El cliente no realiza ningún pago.'],
      ['Abono',         'El cliente realizó un pago parcial o total sobre una deuda previamente registrada.'],
    ]
    for (const [label, desc] of conceptos) {
      sc(r, 0, label, sTextoLabel)
      sc(r, 1, desc, sTextoDesc)
      for (let c = 2; c <= 6; c++) sc(r, c, '', sTextoDesc)
      r++
    }

    // ── Sección guía de columnas ────────────────────────────────────────────
    fill7(r, { fill: { fgColor: { rgb: 'EEF2FA' } } }); r++
    sc(r, 0, 'GUÍA DE COLUMNAS', sSeccion)
    for (let c = 1; c <= 6; c++) sc(r, c, '', sSeccion)
    const guiaHeaderRow = r; r++

    const guia = [
      ['VALOR',  'Precio total del libro o libros según la cantidad. En abonos esta columna va vacía.'],
      ['ABONÓ',  'Dinero entregado en el momento como abono parcial (aplica en Credi-Contado y Abonos posteriores).'],
      ['PAGÓ',   'Valor cancelado en su totalidad. Solo aplica para ventas de Contado.'],
    ]
    for (const [label, desc] of guia) {
      sc(r, 0, label, sTextoLabel)
      sc(r, 1, desc, sTextoDesc)
      for (let c = 2; c <= 6; c++) sc(r, c, '', sTextoDesc)
      r++
    }

    // ── Nota final ──────────────────────────────────────────────────────────
    fill7(r, { fill: { fgColor: { rgb: 'EEF2FA' } } }); r++
    sc(r, 0, 'NOTA', { ...sNota, font: { bold: true, italic: true, sz: 10, color: { rgb: C.azulOscuro }, name: 'Calibri' } })
    sc(r, 1, 'Un registro puede tener valor en ABONO o en PAGO, pero nunca en ambos al mismo tiempo.', sNota)
    for (let c = 2; c <= 6; c++) sc(r, c, '', sNota)
    const notaRow = r

    // ── Rango, merges, anchos y alturas ─────────────────────────────────────
    ws['!ref'] = XLSXStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: notaRow, c: 6 } })

    ws['!merges'] = [
      // Título y subtítulo
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      // Fecha / Vendedor
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      { s: { r: 2, c: 4 }, e: { r: 2, c: 6 } },
      // Espacio
      { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } },
      // Totales label
      { s: { r: totalesRow, c: 0 }, e: { r: totalesRow, c: 2 } },
      // Separador
      { s: { r: totalesRow + 1, c: 0 }, e: { r: totalesRow + 1, c: 6 } },
      // Resumen — labels
      { s: { r: resumenLabelRow, c: 1 }, e: { r: resumenLabelRow, c: 2 } },
      { s: { r: resumenLabelRow, c: 3 }, e: { r: resumenLabelRow, c: 4 } },
      { s: { r: resumenLabelRow, c: 5 }, e: { r: resumenLabelRow, c: 6 } },
      // Resumen — valores
      { s: { r: resumenValRow, c: 1 }, e: { r: resumenValRow, c: 2 } },
      { s: { r: resumenValRow, c: 3 }, e: { r: resumenValRow, c: 4 } },
      { s: { r: resumenValRow, c: 5 }, e: { r: resumenValRow, c: 6 } },
      // Separador
      { s: { r: resumenValRow + 1, c: 0 }, e: { r: resumenValRow + 1, c: 6 } },
      // Leyenda header
      { s: { r: leyendaHeaderRow, c: 0 }, e: { r: leyendaHeaderRow, c: 6 } },
      // Separador
      { s: { r: leyendaHeaderRow + 2, c: 0 }, e: { r: leyendaHeaderRow + 2, c: 6 } },
      // Conceptos header
      { s: { r: conceptosHeaderRow, c: 0 }, e: { r: conceptosHeaderRow, c: 6 } },
      // Conceptos descripción (cols 1-6)
      ...conceptos.map((_, i) => ({ s: { r: conceptosHeaderRow + 1 + i, c: 1 }, e: { r: conceptosHeaderRow + 1 + i, c: 6 } })),
      // Separador
      { s: { r: guiaHeaderRow - 1, c: 0 }, e: { r: guiaHeaderRow - 1, c: 6 } },
      // Guía header
      { s: { r: guiaHeaderRow, c: 0 }, e: { r: guiaHeaderRow, c: 6 } },
      // Guía descripción (cols 1-6)
      ...guia.map((_, i) => ({ s: { r: guiaHeaderRow + 1 + i, c: 1 }, e: { r: guiaHeaderRow + 1 + i, c: 6 } })),
      // Separador
      { s: { r: notaRow - 1, c: 0 }, e: { r: notaRow - 1, c: 6 } },
      // Nota (cols 1-6)
      { s: { r: notaRow, c: 1 }, e: { r: notaRow, c: 6 } },
    ]

    ws['!cols'] = [
      { wch: 26 }, // Nombres
      { wch: 30 }, // Libro
      { wch: 16 }, // Movimiento
      { wch: 8  }, // Cant
      { wch: 16 }, // Valor
      { wch: 16 }, // Abonó
      { wch: 16 }, // Pagó
    ]

    ws['!rows'] = [
      { hpt: 32 }, // Título
      { hpt: 24 }, // Subtítulo
      { hpt: 22 }, // Fecha/Vendedor
      { hpt: 6  }, // Espacio
      { hpt: 22 }, // Headers
    ]

    XLSXStyle.utils.book_append_sheet(wb, ws, 'Planilla')
    XLSXStyle.writeFile(wb, `Planilla_Literatura_${diaSeleccionado}.xlsx`)
  }

  const año = mesActual.getFullYear()
  const mes = mesActual.getMonth()
  const primerDia = new Date(año, mes, 1).getDay()
  const diasEnMes = new Date(año, mes + 1, 0).getDate()
  const diasMap = Object.fromEntries(diasConVentas.map(d => [d.fecha, d]))
  const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const fmt = (v: number) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })

  const badgeMovimiento = (tipo: string) => {
    const cfg: Record<string, { bg: string; color: string; border: string }> = {
      'Contado':       { bg: '#D6F5E6', color: '#1A7A4A', border: '#86EFAC' },
      'Crédito':       { bg: '#FFE8E8', color: '#B91C1C', border: '#FCA5A5' },
      'Credi-Contado': { bg: '#FFF8DC', color: '#92400E', border: '#FCD34D' },
      'Ofrendado':     { bg: '#FFF0E0', color: '#C2410C', border: '#FDBA74' },
      'Abono':         { bg: '#D6E4F7', color: '#1A3A6B', border: '#93C5FD' },
    }
    const c = cfg[tipo] ?? { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' }
    return (
      <span style={{
        display: 'inline-block',
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        borderRadius: 20,
        padding: '2px 10px',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        whiteSpace: 'nowrap',
      }}>{tipo}</span>
    )
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#EEF2FA', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .top-bar { background: #4D7BFE; color: white; padding: 44px 24px 24px; border-radius: 0 0 28px 28px; }
        .back-btn { background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 10px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .calendar-card { background: white; border-radius: 20px; margin: 16px 20px; padding: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
        .cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .cal-nav { background: #EEF2FA; border: none; border-radius: 10px; width: 36px; height: 36px; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #4D7BFE; font-weight: 700; }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .cal-day-name { text-align: center; font-size: 11px; font-weight: 700; color: #A0AEC0; padding: 6px 0; }
        .cal-day { aspect-ratio: 1; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 14px; color: #718096; font-weight: 500; transition: all 0.15s; }
        .cal-day.tiene-ventas { background: #EEF2FA; cursor: pointer; border: 2px solid #4D7BFE; color: #4D7BFE; font-weight: 700; }
        .cal-day.tiene-ventas:hover { background: #4D7BFE; color: white; transform: scale(1.05); }
        .cal-day.seleccionado { background: #4D7BFE !important; color: white !important; transform: scale(1.05); }
        .dot { width: 5px; height: 5px; border-radius: 50%; background: #4D7BFE; margin-top: 2px; }
        .cal-day.seleccionado .dot, .cal-day.tiene-ventas:hover .dot { background: white; }
        .empty { aspect-ratio: 1; }
        .detalle-card { background: white; border-radius: 20px; margin: 0 20px 16px; padding: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
        .legend { display: flex; align-items: center; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid #F7FAFC; }
        .legend-dot { width: 12px; height: 12px; border-radius: 3px; background: #EEF2FA; border: 2px solid #4D7BFE; flex-shrink: 0; }
        .planilla-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .planilla-table thead th { background: #1A3A6B; color: white; padding: 10px 8px; text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; position: sticky; top: 0; z-index: 2; }
        .planilla-table thead th:first-child { text-align: left; border-radius: 8px 0 0 0; }
        .planilla-table thead th:last-child { border-radius: 0 8px 0 0; }
        .planilla-table tbody tr:nth-child(even) td { background: #F4F7FB; }
        .planilla-table tbody tr:nth-child(odd) td { background: #FFFFFF; }
        .planilla-table tbody tr:hover td { background: #EEF2FA !important; }
        .planilla-table td { padding: 9px 8px; color: #4A5568; border-bottom: 1px solid #E2E8F0; vertical-align: middle; }
        .planilla-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .planilla-table tfoot td { background: #1A3A6B !important; color: white; font-weight: 700; padding: 10px 8px; font-size: 12px; }
        .planilla-table tfoot td.num { text-align: right; }
        .ver-btn { width: 100%; background: #4D7BFE; color: white; border: none; border-radius: 14px; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; margin-top: 14px; box-shadow: 0 6px 20px rgba(77,123,254,0.3); transition: opacity 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .ver-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .excel-btn { width: 100%; background: #fff; color: #1A3A6B; border: 2px solid #1A3A6B; border-radius: 14px; padding: 12px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.15s; }
        .excel-btn:hover { background: #EEF2FA; }
        .planilla-section { background: white; border-radius: 20px; margin: 0 20px 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); overflow: hidden; }
        .planilla-header { background: #1A3A6B; color: white; padding: 16px 20px; }
        .planilla-header h2 { font-size: 15px; font-weight: 700; }
        .planilla-header p { font-size: 12px; opacity: 0.75; margin-top: 2px; }
        .planilla-meta { display: flex; justify-content: space-between; align-items: center; background: #D6E4F7; padding: 10px 16px; font-size: 12px; color: #1A3A6B; font-weight: 600; flex-wrap: wrap; gap: 6px; }
        .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .totales-row { display: flex; gap: 10px; padding: 14px 16px; background: #EEF2FA; border-top: 1px solid #D6E4F7; flex-wrap: wrap; }
        .total-item { flex: 1; min-width: 70px; text-align: center; }
        .total-item .val { font-size: 15px; font-weight: 700; color: #1A3A6B; }
        .total-item .lbl { font-size: 10px; color: #718096; margin-top: 2px; }
      `}</style>

      {/* Top bar */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="back-btn" onClick={() => router.back()}>←</button>
          <div>
            <p style={{ fontSize: 13, opacity: 0.75 }}>Reportes</p>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Planillas</h1>
          </div>
        </div>
      </div>

      {/* Calendario */}
      <div className="calendar-card">
        <div className="cal-header">
          <button className="cal-nav" onClick={() => setMesActual(new Date(año, mes - 1, 1))}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#1A202C' }}>{nombresMes[mes]}</p>
            <p style={{ fontSize: 13, color: '#A0AEC0' }}>{año}</p>
          </div>
          <button className="cal-nav" onClick={() => setMesActual(new Date(año, mes + 1, 1))}>›</button>
        </div>

        <div className="cal-grid">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
            <div key={d} className="cal-day-name">{d}</div>
          ))}
          {Array.from({ length: primerDia }).map((_, i) => <div key={`e-${i}`} className="empty" />)}
          {Array.from({ length: diasEnMes }).map((_, i) => {
            const dia = i + 1
            const fechaStr = `${año}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
            const tieneVentas = !!diasMap[fechaStr]
            const seleccionado = diaSeleccionado === fechaStr
            const hoy = new Date().toISOString().split('T')[0] === fechaStr
            return (
              <div
                key={dia}
                className={`cal-day ${tieneVentas ? 'tiene-ventas' : ''} ${seleccionado ? 'seleccionado' : ''}`}
                style={hoy && !tieneVentas ? { fontWeight: 700, color: '#1A202C' } : {}}
                onClick={() => tieneVentas && seleccionarDia(fechaStr)}
              >
                {dia}
                {tieneVentas && <div className="dot" />}
              </div>
            )
          })}
        </div>

        <div className="legend">
          <div className="legend-dot" />
          <p style={{ fontSize: 12, color: '#718096' }}>Días con ventas o movimientos registrados — toca para ver detalle</p>
        </div>
      </div>

      {/* Resumen del día seleccionado */}
      {diaSeleccionado && (
        <div className="detalle-card">
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1A202C' }}>
            {new Date(diaSeleccionado + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
          {resumenDia && (
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <div style={{ flex: 1, background: '#EEF2FA', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: '#4D7BFE' }}>{resumenDia.ventas}</p>
                <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>Transacciones</p>
              </div>
              <div style={{ flex: 1, background: '#EEF2FA', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#48BB78' }}>{fmt(resumenDia.monto)}</p>
                <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>Total del día</p>
              </div>
            </div>
          )}
          <button className="ver-btn" onClick={cargarPlanilla} disabled={generando}>
            {generando ? '⏳ Cargando planilla...' : '📋 Ver Planilla del Día'}
          </button>
        </div>
      )}

      {/* Planilla visual en pantalla */}
      {planillaData && (
        <div className="planilla-section">
          {/* Encabezado */}
          <div className="planilla-header">
            <h2>IGLESIA EN MONTERÍA — SERVICIO DE LITERATURA</h2>
            <p>FORMATO DE DISTRIBUCIÓN Y CONTROL DE VENTAS</p>
          </div>

          {/* Meta: fecha y vendedor */}
          <div className="planilla-meta">
            <span>📅 {planillaData.fechaFormateada}</span>
            <span>👤 {planillaData.vendedoresStr}</span>
          </div>

          {/* Tabla */}
          <div className="table-wrap">
            <table className="planilla-table">
              <thead>
                <tr>
                  <th>NOMBRES</th>
                  <th>LIBRO</th>
                  <th>MOVIMIENTO</th>
                  <th>CANT.</th>
                  <th>VALOR</th>
                  <th>ABONÓ</th>
                  <th>PAGÓ</th>
                </tr>
              </thead>
              <tbody>
                {planillaData.filas.map((fila, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600, color: '#1A202C' }}>{fila.nombre}</td>
                    <td style={{ color: '#4A5568', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fila.libro}</td>
                    <td style={{ textAlign: 'center' }}>{badgeMovimiento(fila.movimiento)}</td>
                    <td className="num">{fila.cantidad !== '' ? fila.cantidad : <span style={{ color: '#CBD5E0' }}>—</span>}</td>
                    <td className="num">{typeof fila.valor === 'number' ? fmt(fila.valor) : <span style={{ color: '#CBD5E0' }}>—</span>}</td>
                    <td className="num" style={{ color: '#2E5EAA', fontWeight: typeof fila.abono === 'number' ? 600 : 400 }}>
                      {typeof fila.abono === 'number' ? fmt(fila.abono) : <span style={{ color: '#CBD5E0' }}>—</span>}
                    </td>
                    <td className="num" style={{ color: '#1A7A4A', fontWeight: typeof fila.pago === 'number' ? 600 : 400 }}>
                      {typeof fila.pago === 'number' ? fmt(fila.pago) : <span style={{ color: '#CBD5E0' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ fontWeight: 700, letterSpacing: 0.5 }}>TOTALES</td>
                  <td className="num">{planillaData.totales.cant}</td>
                  <td className="num">{fmt(planillaData.totales.valor)}</td>
                  <td className="num">{fmt(planillaData.totales.abono)}</td>
                  <td className="num">{fmt(planillaData.totales.pago)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Totales resumen visual */}
          <div className="totales-row">
            <div className="total-item">
              <div className="val">{planillaData.totales.cant}</div>
              <div className="lbl">Libros</div>
            </div>
            <div className="total-item">
              <div className="val" style={{ color: '#4A5568' }}>{fmt(planillaData.totales.valor)}</div>
              <div className="lbl">Valor total</div>
            </div>
            <div className="total-item">
              <div className="val" style={{ color: '#2E5EAA' }}>{fmt(planillaData.totales.abono)}</div>
              <div className="lbl">Total abonado</div>
            </div>
            <div className="total-item">
              <div className="val" style={{ color: '#1A7A4A' }}>{fmt(planillaData.totales.pago)}</div>
              <div className="lbl">Total pagado</div>
            </div>
          </div>

          {/* Leyenda de colores */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #E2E8F0' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#718096', marginBottom: 8, letterSpacing: 0.4 }}>TIPOS DE MOVIMIENTO</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(['Contado', 'Crédito', 'Credi-Contado', 'Ofrendado', 'Abono'] as const).map(t => (
                <div key={t}>{badgeMovimiento(t)}</div>
              ))}
            </div>
          </div>

          {/* Botón descargar Excel (secundario) */}
          <div style={{ padding: '0 16px 16px' }}>
            <button className="excel-btn" onClick={descargarExcel}>
              📥 Descargar como Excel
            </button>
          </div>
        </div>
      )}

      {!diaSeleccionado && !loading && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#A0AEC0' }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>📅</p>
          <p style={{ fontSize: 14 }}>Toca un día marcado para ver el resumen y la planilla</p>
        </div>
      )}
    </main>
  )
}