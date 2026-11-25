package it.xcenter.id

data class XCenterSessionTokens(val accessToken:String,val refreshToken:String?,val expiresAt:Long) {
    override fun toString() = "XCenterSessionTokens(expiresAt=$expiresAt)"
}

/** One source per persisted product session. Backend workers also need a process-shared lock. */
class XCenterSessionTokenSource(
    private val load:()->XCenterSessionTokens?,
    private val save:(XCenterSessionTokens)->Unit,
    private val refresh:(String)->XCenterSessionTokens
) {
    @Synchronized fun accessToken():String {
        val current=checkNotNull(load()) { "Sign in to X-Center ID first." }
        check(current.accessToken.isNotEmpty())
        val now=System.currentTimeMillis()
        if(current.expiresAt-now>30_000)return current.accessToken
        val refreshToken=current.refreshToken
        if(refreshToken.isNullOrEmpty()){
            check(current.expiresAt>now) { "X-Center ID sign-in expired." }
            return current.accessToken
        }
        val next=refresh(refreshToken)
        check(next.accessToken.isNotEmpty()&&!next.refreshToken.isNullOrEmpty()&&next.expiresAt>System.currentTimeMillis()){
            "Invalid refresh response."
        }
        save(next)
        return next.accessToken
    }
}
