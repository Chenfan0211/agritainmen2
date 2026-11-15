package com.agritainmen.auth.web;

import com.agritainmen.auth.service.AuthService;
import com.agritainmen.auth.web.AuthDtos.LoginRequest;
import com.agritainmen.auth.web.AuthDtos.LogoutRequest;
import com.agritainmen.auth.web.AuthDtos.Profile;
import com.agritainmen.auth.web.AuthDtos.RefreshRequest;
import com.agritainmen.auth.web.AuthDtos.TokenResponse;
import com.agritainmen.auth.web.AuthDtos.WechatExchangeRequest;
import com.agritainmen.common.core.ApiResponse;
import com.agritainmen.common.core.BusinessException;
import com.agritainmen.common.core.ErrorCode;
import com.agritainmen.common.security.TokenClaims;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private static final String ADMIN_REFRESH_COOKIE = "agritainmen_admin_refresh";
    private final AuthService authService;

    public AuthController(AuthService authService) { this.authService = authService; }

    @PostMapping("/admin/login")
    public ApiResponse<TokenResponse> adminLogin(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest, HttpServletResponse response) {
        TokenResponse token = authService.login("admin", request.account(), request.password());
        response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie(servletRequest, token.refreshToken()).toString());
        return ApiResponse.ok(token);
    }

    @PostMapping("/store/login")
    public ApiResponse<TokenResponse> storeLogin(@Valid @RequestBody LoginRequest request) { return ApiResponse.ok(authService.login("store", request.account(), request.password())); }

    @PostMapping("/supplier/login")
    public ApiResponse<TokenResponse> supplierLogin(@Valid @RequestBody LoginRequest request) { return ApiResponse.ok(authService.login("supplier", request.account(), request.password())); }

    @PostMapping("/driver/login")
    public ApiResponse<TokenResponse> driverLogin(@Valid @RequestBody LoginRequest request) { return ApiResponse.ok(authService.login("driver", request.account(), request.password())); }

    @PostMapping("/wechat/exchange")
    public ApiResponse<TokenResponse> exchange(@Valid @RequestBody WechatExchangeRequest request) { return ApiResponse.ok(authService.exchangeWechat(request.app(), request.code())); }

    @PostMapping("/refresh")
    public ApiResponse<TokenResponse> refresh(@RequestBody(required = false) RefreshRequest request,
                                              @CookieValue(value = ADMIN_REFRESH_COOKIE, required = false) String cookieToken,
                                              HttpServletRequest servletRequest, HttpServletResponse response) {
        String refreshToken = request == null ? cookieToken : request.refreshToken();
        if (refreshToken == null || refreshToken.isBlank()) throw new BusinessException(ErrorCode.BAD_REQUEST, "refreshToken 不能为空");
        TokenResponse token = authService.refresh(refreshToken);
        if (request == null) response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie(servletRequest, token.refreshToken()).toString());
        return ApiResponse.ok(token);
    }

    @PostMapping("/logout")
    public ApiResponse<Boolean> logout(@RequestBody(required = false) LogoutRequest request,
                                       @CookieValue(value = ADMIN_REFRESH_COOKIE, required = false) String cookieToken,
                                       HttpServletResponse response) {
        String refreshToken = request == null ? cookieToken : request.refreshToken();
        if (refreshToken == null || refreshToken.isBlank()) return ApiResponse.ok(false);
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(ADMIN_REFRESH_COOKIE, "").httpOnly(true).secure(false).sameSite("Lax").path("/api/v1/auth").maxAge(Duration.ZERO).build().toString());
        return ApiResponse.ok(authService.logout(refreshToken));
    }

    @GetMapping("/me")
    public ApiResponse<Profile> me(@RequestHeader(value = "Authorization", required = false) String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        TokenClaims claims = authService.verifyAccessToken(authorization.substring(7));
        return ApiResponse.ok(new Profile(claims.actorType(), claims.actorId(), claims.tenantId(), null,
                "user".equals(claims.actorType()) ? claims.subject() : null,
                null, null, null, claims.roles(), claims.permissions(), claims.supplierId(),
                "driver".equals(claims.actorType()) ? claims.actorId() : null,
                "store".equals(claims.actorType()) ? claims.subject() : null));
    }

    @GetMapping("/store/farm")
    public ApiResponse<com.agritainmen.auth.service.StoreAccountBindingClient.StoreFarm> storeFarm(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) throw new BusinessException(ErrorCode.UNAUTHORIZED);
        return ApiResponse.ok(authService.storeFarm(authorization.substring(7)));
    }

    private ResponseCookie refreshCookie(HttpServletRequest request, String refreshToken) {
        return ResponseCookie.from(ADMIN_REFRESH_COOKIE, refreshToken)
                .httpOnly(true)
                .secure(request.isSecure())
                .sameSite("Lax")
                .path("/api/v1/auth")
                .maxAge(Duration.ofDays(7))
                .build();
    }
}
