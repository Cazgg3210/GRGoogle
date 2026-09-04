import { z, type ZodTypeAny } from 'zod'

/**
 * Conversión Zod → JSON Schema (subconjunto soportado por Gemini
 * `responseJsonSchema`: type, properties, required, items, enum, minimum,
 * maximum, minItems, maxItems, anyOf, description, additionalProperties).
 * Cubre los tipos usados por los schemas de @smlxl/contracts.
 */
export type JsonSchema = {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null'
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: Array<string | number>
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  anyOf?: JsonSchema[]
  description?: string
  additionalProperties?: boolean
  propertyOrdering?: string[]
}

function withDescription(schema: JsonSchema, description: string | undefined): JsonSchema {
  return description ? { ...schema, description } : schema
}

export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const description = schema.description
  const def = schema._def as { typeName: string }
  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (schema as z.AnyZodObject).shape as Record<string, ZodTypeAny>
      const properties: Record<string, JsonSchema> = {}
      const required: string[] = []
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(value)
        if (!value.isOptional()) required.push(key)
      }
      const out: JsonSchema = { type: 'object', properties, additionalProperties: false, propertyOrdering: Object.keys(shape) }
      if (required.length > 0) out.required = required
      return withDescription(out, description)
    }
    case z.ZodFirstPartyTypeKind.ZodString: {
      const out: JsonSchema = { type: 'string' }
      for (const check of (schema as z.ZodString)._def.checks) {
        if (check.kind === 'min') out.minLength = check.value
        if (check.kind === 'max') out.maxLength = check.value
        if (check.kind === 'regex') out.pattern = check.regex.source
      }
      return withDescription(out, description)
    }
    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const out: JsonSchema = { type: 'number' }
      for (const check of (schema as z.ZodNumber)._def.checks) {
        if (check.kind === 'min') out.minimum = check.value
        if (check.kind === 'max') out.maximum = check.value
        if (check.kind === 'int') out.type = 'integer'
      }
      return withDescription(out, description)
    }
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return withDescription({ type: 'boolean' }, description)
    case z.ZodFirstPartyTypeKind.ZodNull:
      return { type: 'null' }
    case z.ZodFirstPartyTypeKind.ZodLiteral: {
      const value = (schema as z.ZodLiteral<string | number>)._def.value
      return withDescription({ type: typeof value === 'number' ? 'number' : 'string', enum: [value] }, description)
    }
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return withDescription({ type: 'string', enum: [...(schema as z.ZodEnum<[string, ...string[]]>)._def.values] }, description)
    case z.ZodFirstPartyTypeKind.ZodNativeEnum: {
      const values = Object.values((schema as z.ZodNativeEnum<Record<string, string>>)._def.values).filter(
        (v): v is string => typeof v === 'string',
      )
      return withDescription({ type: 'string', enum: values }, description)
    }
    case z.ZodFirstPartyTypeKind.ZodArray: {
      const arr = schema as z.ZodArray<ZodTypeAny>
      const out: JsonSchema = { type: 'array', items: zodToJsonSchema(arr._def.type) }
      if (arr._def.minLength) out.minItems = arr._def.minLength.value
      if (arr._def.maxLength) out.maxItems = arr._def.maxLength.value
      return withDescription(out, description)
    }
    case z.ZodFirstPartyTypeKind.ZodNullable: {
      const inner = zodToJsonSchema((schema as z.ZodNullable<ZodTypeAny>)._def.innerType)
      return withDescription({ anyOf: [inner, { type: 'null' }] }, description)
    }
    case z.ZodFirstPartyTypeKind.ZodOptional:
      return withDescription(zodToJsonSchema((schema as z.ZodOptional<ZodTypeAny>)._def.innerType), description)
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return withDescription(zodToJsonSchema((schema as z.ZodDefault<ZodTypeAny>)._def.innerType), description)
    case z.ZodFirstPartyTypeKind.ZodEffects:
      return withDescription(zodToJsonSchema((schema as z.ZodEffects<ZodTypeAny>)._def.schema), description)
    case z.ZodFirstPartyTypeKind.ZodUnion: {
      const options = (schema as z.ZodUnion<[ZodTypeAny, ...ZodTypeAny[]]>)._def.options
      return withDescription({ anyOf: options.map((o) => zodToJsonSchema(o)) }, description)
    }
    case z.ZodFirstPartyTypeKind.ZodRecord:
      return withDescription({ type: 'object', additionalProperties: true }, description)
    case z.ZodFirstPartyTypeKind.ZodUnknown:
    case z.ZodFirstPartyTypeKind.ZodAny:
      return withDescription({}, description)
    default:
      throw new Error(`zodToJsonSchema: tipo Zod no soportado (${def.typeName})`)
  }
}

/** Gemini no acepta `pattern`/`minLength`/`maxLength` en responseSchema; los eliminamos para `responseJsonSchema` compatible. */
export function zodToGeminiSchema(schema: ZodTypeAny): JsonSchema {
  const strip = (s: JsonSchema): JsonSchema => {
    const { pattern: _pattern, minLength: _minLength, maxLength: _maxLength, ...rest } = s
    const out: JsonSchema = { ...rest }
    if (out.properties) {
      const props: Record<string, JsonSchema> = {}
      for (const [k, v] of Object.entries(out.properties)) props[k] = strip(v)
      out.properties = props
    }
    if (out.items) out.items = strip(out.items)
    if (out.anyOf) out.anyOf = out.anyOf.map(strip)
    return out
  }
  return strip(zodToJsonSchema(schema))
}
