plugins {
    kotlin("jvm") version "2.2.21"
    `maven-publish`
}
group = "it.xcenter.id"
version = "0.1.0"

repositories { mavenCentral() }

dependencies {
    implementation("org.json:json:20250517")
}
kotlin {
    jvmToolchain(17)
    sourceSets.named("main") { kotlin.srcDir("../kotlin-protocol/src/main/kotlin") }
}
publishing {
    publications {
        create<MavenPublication>("local") { from(components["java"]) }
    }
}
