package expo.modules.persistentbackgroundlocation

/** Mirrors `SyncResult` in the TypeScript layer. */
internal data class SyncResult(
  val success: Boolean,
  val count: Int,
  val status: Int?,
  val error: String?
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "success" to success,
    "count" to count,
    "status" to status,
    "error" to error
  )
}
