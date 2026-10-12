from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import camera as cam


@api_view(["GET"])
def api_info(request):
    return Response({
        "points": cam.POINT_CATALOG,
        "problems": cam.PROBLEM_CATALOG,
        "meridians": cam.C.MERIDIANS,
        "metrics": cam.BASELINE_METRICS,
        "reference_views": cam.REFERENCE_VIEWS,
        "engine": cam.ENGINE,
    })


@api_view(["POST"])
def api_detect(request):
    """Stateless per-frame detection: the browser sends the 21 MediaPipe
    landmarks it already computed client-side for each visible hand, we
    resolve which acupressure points/problems are active and hand back their
    image-space coordinates for the browser to draw."""
    hands_dict = cam.hands_from_landmarks(request.data.get("hands", []))
    return Response(cam.build_state(hands_dict))
