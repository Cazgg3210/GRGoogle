/**
 * Genera el workbook de prueba `tests/fixtures/legacy/maestro-fixture.xlsx`
 * reproduciendo los problemas de calidad del legado (§16.4): IDs repetidos,
 * contradicciones Status/Completada, variantes de casing y de nombres, celdas
 * vacías/0, actividades recurrentes, títulos casi duplicados y una hoja
 * Externos con Empresa/Contacto. Incluye hojas calculadas (Dashboard, Maestro,
 * Listas) que el importador debe ignorar.
 *
 * Ejecutar: pnpm legacy:fixture [ruta]
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

export const DEFAULT_FIXTURE_PATH = 'tests/fixtures/legacy/maestro-fixture.xlsx'

const INTERNAL_HEADER = [
  'ID',
  'Pendiente',
  'Responsable',
  'Departamento',
  'Proyecto / Frente',
  'Fecha de la junta',
  'Semana',
  'Prioridad',
  'Status',
  'Completada',
  'Vencido?',
  'Comentarios',
]

const EXTERNAL_HEADER = [
  'ID',
  'Pendiente',
  'Responsable',
  'Empresa',
  'Contacto',
  'Proyecto / Frente',
  'Fecha de la junta',
  'Prioridad',
  'Status',
  'Completada',
  'Comentarios',
]

/** Serial de Excel para una fecha (1900 date system). */
function excelSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const utc = Date.UTC(y, m - 1, d)
  return Math.round(utc / 86_400_000) + 25569
}

type Cell = string | number | null

/** Filas por hoja. Los nombres de responsables coinciden con los usuarios/alias del seed. */
export const FIXTURE_ROWS: Record<string, Cell[][]> = {
  Jurídico: [
    ['JU-01', 'Revisar contrato de arrendamiento de oficinas', 'Lisa de la Fuente', 'Jurídico', null, '2026-08-05', 32, 'Alta', 'En proceso', 0, 'No', 'Falta anexo de mantenimiento'],
    ['JU-02', 'Registrar marca ante el IMPI', 'Lisa de La Fuente', 'Jurídico', null, '2026-08-05', 32, 'Media', 'Completo', 1, 'No', null],
    ['JU-03', 'Actualizar política de firmas electrónicas', 'Lisa de la Fuente', 'Jurídico', null, '2026-08-12', 33, 'Baja', 'Pendiente', 1, 'Sí', 'Por revisar'],
    ['JU-01', 'Dictamen sobre cláusula de exclusividad cliente alfa', 'Lisa', 'Jurídico', 'cliente alfa', '2026-08-19', 34, 'Alta', 'completo', 1, 'No', null],
  ],
  'Ventas y Marketing': [
    ['VM-01', 'Diseñar campaña digital Q4', 'Paola Mendieta', 'Ventas y Marketing', 'Campaña Q4', excelSerial('2026-08-05'), 32, 'Alta', 'En proceso', 0, 'No', null],
    ['VM-02', 'Actualizar organigrama en el sitio web', 'Paola', 'Ventas y Marketing', null, '2026-08-12', 33, 'Baja', 'Entregado', 1, 'No', 'Entregado a Dirección, pendiente visto bueno'],
    ['VM-03', 'Cotizar agencia de video', null, 'Ventas y Marketing', 'Campaña Q4', '2026-08-19', 34, 'Media', 'Pendiente', 0, 'Sí', null],
    ['JU-01', 'Preparar estudio de mercado zona norte', 'Paola Mendieta', 'Ventas y Marketing', 'Expansión Norte', '2026-08-26', 35, 'Media', 'Pendiente', 0, 'No', null],
  ],
  'Operaciones y Proyectos': [
    ['OP-01', 'Configurar ambiente de pruebas Plataforma Beta', 'Rodrigo Navarro', 'Operaciones', 'Beta', '2026-08-05', 32, 'Alta', 'En proceso', 0, 'Sí', 'Proyecto en pausa hasta recibir credenciales'],
    ['OP-02', 'Enviar carta de intención a Cliente Alfa', 'Andrés', 'Operaciones y Proyectos', 'Cliente Alfa', '2026-08-12', 33, 'Alta', 'Pendiente', 0, 'Sí', null],
    ['OP-03', 'Enviar carta de intencion al cliente Alfa', 'Andres', 'Operaciones y Proyectos', 'Alfa', '2026-08-19', 34, 'Alta', 'Pendiente', 0, 'No', null],
    ['OP-04', 'Migrar expedientes a Drive compartido', 'Andres Escandon', 'Operaciones y Proyectos', 'Nuevo Frente Logística', '2026-08-19', 34, 'Media', 'Completo', 1, 'No', null],
    ['OP-05', 'Reporte semanal de avances de proyectos', 'Rodrigo Navarro', 'Operaciones y Proyectos', null, '2026-08-26', 35, 'Media', 'En proceso', 0, 'No', 'Cada lunes'],
    [null, null, null, null, null, null, null, null, null, null, null, null],
    ['   ', null, null, null, null, null, null, null, null, null, null, null],
  ],
  'Admin y Finanzas': [
    ['AF-01', 'Seguimiento diario a cobranza', 'Héctor Salgado', 'Admin y Finanzas', null, '2026-08-05', 32, 'Media', 'En proceso', 0, 'No', 'Actividad diaria'],
    ['AF-02', 'Renovar póliza de seguro de oficinas', 'Hector Salgado', 'Admin y Finanzas', null, '2026-08-05', 32, 'Media', 'Completo', 1, 'No', null],
    ['AF-03', 'Conciliar cuentas bancarias de agosto', 'Héctor', 'Admin y Finanzas', 'Cierre Fiscal', 'agosto', 33, 'Alta', 'Completo', 0, 'No', null],
    ['AF-04', 'Contratar servicio de mensajería', 0, 'Admin y Finanzas', 0, null, 0, 0, 0, 0, 0, 0],
  ],
  'Dirección General': [
    ['DG-01', 'Preparar reporte trimestral para el consejo', 'Lucía Ferrer', 'Dirección General', null, '2026-08-12', 33, 'Alta', 'Completo', 1, 'No', null],
    ['DG-02', 'Definir OKRs del Q4 por área', 'Lucia Ferrer', 'Dirección General', null, '2026-08-26', 35, 'Alta', 'Pendiente', 0, 'No', null],
    ['DG-03', 'Aprobar plan de expansión Norte', 'Lucía Ferrer', 'Dirección General', 'Expansion Norte', '2026-08-26', 35, 'Alta', 'Entregado', 1, 'No', 'Falta firma'],
  ],
  'Captación de Capital': [
    ['CC-01', 'Preparar deck para inversionistas Fondo Gamma', 'Daniela Ortiz', 'Captación de Capital', 'Fondo Gamma', '2026-08-05', 32, 'Alta', 'Completo', 1, 'No', null],
    ['CC-02', 'Agendar segunda ronda con inversionistas', 'Daniela', 'Captación de Capital', 'gamma', '2026-08-19', 34, 'Media', 'En proceso', 0, 'Sí', null],
  ],
  'Servicio al Cliente': [
    ['SC-01', 'Responder quejas pendientes del portal', 'Iván Robles', 'Servicio al Cliente', 'Portal de Clientes', '2026-08-12', 33, 'Alta', 'En proceso', 0, 'Sí', null],
    ['SC-02', 'Implementar encuesta NPS', 'Ivan Robles', 'Servicio al Cliente', 'Portal', '2026-08-19', 34, 'Media', 'Pendiente', 0, 'No', null],
    ['SC-03', 'Capacitar al equipo de soporte', 'Mario Quintero', 'Servicio al Cliente', 'Portal', '2026-08-19', 34, 'Urgente', 'Pendiente', 0, 'No', null],
  ],
  Externos: [
    ['EX-01', 'Revisar deducciones fiscales de agosto', 'Despacho Contable Ruiz', 'Ruiz y Asociados', 'Ricardo Ruiz', 'Cierre Fiscal', '2026-08-12', 'Media', 'Pendiente', 0, null],
    ['EX-02', 'Entregar credenciales del ambiente de pruebas', 'Proveedor TI Nube MX', 'Nube MX', 'Elena Vidal', 'Beta', '2026-08-05', 'Alta', 'En proceso', 0, 'Esperan contrato de soporte'],
    ['EX-03', 'Escriturar terreno de Monterrey', 'Notaría 27', 'Notaría Pública 27', null, 'Expansión Norte', '2026-08-26', 'Media', 'Pendiente', 0, null],
  ],
}

export function buildFixtureWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  // Hojas calculadas: deben ignorarse aunque contengan encabezados parecidos.
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Dashboard SMLXL'],
      ['Departamento', 'Total', 'Completadas', 'En proceso', 'Pendientes', 'Vencidas', '% avance'],
      ['Jurídico', 4, 2, 1, 1, 1, 0.5],
    ]),
    'Dashboard',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      INTERNAL_HEADER,
      ['MAESTRO-1', 'Fila calculada que NO debe importarse', 'Nadie', 'Jurídico', null, '2026-08-01', 31, 'Alta', 'Pendiente', 0, 'No', null],
    ]),
    'Maestro',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Status', 'Prioridad'],
      ['Pendiente', 'Alta'],
      ['En proceso', 'Media'],
      ['Completo', 'Baja'],
    ]),
    'Listas',
  )

  for (const [sheet, rows] of Object.entries(FIXTURE_ROWS)) {
    const header = sheet === 'Externos' ? EXTERNAL_HEADER : INTERNAL_HEADER
    const aoa: Cell[][] = [
      ['SMLXL — Maestro de Tareas AGOSTO 2026'],
      [],
      [`Hoja: ${sheet}`, null, 'Actualizado: 2026-08-31'],
      header,
      ...rows,
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet)
  }
  return wb
}

export function writeFixture(filePath = DEFAULT_FIXTURE_PATH): string {
  const absolute = path.resolve(filePath)
  mkdirSync(path.dirname(absolute), { recursive: true })
  XLSX.writeFile(buildFixtureWorkbook(), absolute)
  return absolute
}

const isMain = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false
if (isMain) {
  const target = process.argv[2] ?? DEFAULT_FIXTURE_PATH
  const written = writeFixture(target)
  const rows = Object.values(FIXTURE_ROWS).reduce((acc, r) => acc + r.length, 0)
  console.log(`Fixture legado escrito en ${written} (${Object.keys(FIXTURE_ROWS).length} hojas fuente, ${rows} filas incluyendo vacías)`)
}
