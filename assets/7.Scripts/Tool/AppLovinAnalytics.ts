
// export enum EventName {
//     LOADING,
//     LOADED,
//     DISPLAYED,
//     CHALLENGE_STARTED,
//     CHALLENGE_PASS_25,
//     CHALLENGE_PASS_50,
//     CHALLENGE_PASS_75,
//     CHALLENGE_SOLVED,
//     CHALLENGE_FAILED,
//     CHALLENGE_RETRY,
//     ENDCARD_SHOWN,
//     CTA_CLICKED
// }

import { Director, director, DirectorEvent } from "cc";

export class AppLovinAnalytics {

    static track(event: string) {
        console.log(event);
        
        const analytics = (window as any).ALPlayableAnalytics;
        if (analytics) {
            analytics.trackEvent(event);
        }
    }

    static startLoading() {
        this.track("LOADING");
    }

    static loaded() {
        this.track("LOADED");
    }

    static displayed() {
        this.track("DISPLAYED");
    }

    static challengeStarted() {
        this.track("CHALLENGE_STARTED");
    }

    static challenge25() {
        this.track("CHALLENGE_PASS_25");
    }

    static challenge50() {
        this.track("CHALLENGE_PASS_50");
    }

    static challenge75() {
        this.track("CHALLENGE_PASS_75");
    }

    static challengeSolved() {
        this.track("CHALLENGE_SOLVED");
    }

    static challengeFailed() {
        this.track("CHALLENGE_FAILED");
    }

    static challengeRetry() {
        this.track("CHALLENGE_RETRY");
    }

    static endcardShown() {
        this.track("ENDCARD_SHOWN");
    }

    static ctaClicked() {
        this.track("CTA_CLICKED");
    }
}

// Check start loading
AppLovinAnalytics.startLoading();

director.once(Director.EVENT_BEFORE_SCENE_LAUNCH, () => {
    AppLovinAnalytics.loaded();
})

director.once(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
    AppLovinAnalytics.displayed();
})


// Tutorial: use these methods inside game logic
// use method: AppLovinAnalytics.startLoading(); when game start loading
// use method: AppLovinAnalytics.loaded(); when game loaded
// use method: AppLovinAnalytics.displayed(); when game displayed
// use method: AppLovinAnalytics.challengeStarted(); when game start challenge
// use method: AppLovinAnalytics.challenge25(); when challenge pass 25%
// use method: AppLovinAnalytics.challenge50(); when challenge pass 50%
// use method: AppLovinAnalytics.challenge75(); when challenge pass 75%
// use method: AppLovinAnalytics.challengeSolved(); when challenge solved
// use method: AppLovinAnalytics.challengeFailed(); when challenge failed
// use method: AppLovinAnalytics.challengeRetry(); when challenge retry
// use method: AppLovinAnalytics.endcardShown(); when endcard shown
// use method: AppLovinAnalytics.ctaClicked(); when cta clicked