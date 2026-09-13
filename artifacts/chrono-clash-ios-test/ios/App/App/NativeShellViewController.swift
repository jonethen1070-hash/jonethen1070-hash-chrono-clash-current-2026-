import Capacitor
import UIKit

/// Full-screen Capacitor shell for the existing Chrono Clash web bundle.
/// Does not replace or rewrite the game — it only hosts the current Vite build.
class NativeShellViewController: CAPBridgeViewController {
    override var prefersStatusBarHidden: Bool {
        false
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        .lightContent
    }

    override var prefersHomeIndicatorAutoHidden: Bool {
        true
    }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        .bottom
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        webView?.scrollView.alwaysBounceHorizontal = false
        webView?.scrollView.isScrollEnabled = false
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        webView?.backgroundColor = UIColor(red: 4 / 255, green: 4 / 255, blue: 12 / 255, alpha: 1)
        webView?.isOpaque = false
    }
}
